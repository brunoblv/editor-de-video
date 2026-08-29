import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  config,
  getStorage,
  storageKeys,
  type RenderClip,
  type TopListProps,
} from '@editor-video/core';
import { Prisma } from '@prisma/client';
import { prisma, ProjectStatus } from '@editor-video/db';
import { normalizeClip, probeVideo } from './ffmpeg.js';
import { renderTopList } from './render.js';
import { serveDirectory } from './static-server.js';
import { logger } from './logger.js';
import { emptyTranscript, transcribeClip, transcriptToCaptions, type TranscriptResult } from './captions.js';

const log = logger('pipeline');

/** Fatias: normalização 5–45%, legendas 45–65%, render 65–98%. */
const NORMALIZE_START = 5;
const NORMALIZE_END = 45;
const CAPTIONS_END = 65;
const RENDER_END = 98;

async function setProgress(projectId: string, progress: number, stage: string): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: { progress: Math.round(progress), stage },
  });
}

export async function runRenderPipeline(projectId: string): Promise<void> {
  const storage = getStorage();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { clips: { orderBy: { position: 'asc' } } },
  });

  if (!project) throw new Error(`Projeto ${projectId} não encontrado.`);
  if (project.clips.length < config.limits.minClipsPerProject) {
    throw new Error(
      `O projeto precisa de pelo menos ${config.limits.minClipsPerProject} clipes (tem ${project.clips.length}).`,
    );
  }

  const workDir = path.join(config.tmpDir, `render-${projectId}`);
  const assetsDir = path.join(workDir, 'assets');
  const captionsDir = path.join(workDir, 'captions');
  const outputPath = path.join(workDir, 'final.mp4');

  await fsp.rm(workDir, { recursive: true, force: true });
  await fsp.mkdir(assetsDir, { recursive: true });
  await fsp.mkdir(captionsDir, { recursive: true });

  const assets = await serveDirectory(assetsDir);

  try {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.PROCESSING,
        progress: NORMALIZE_START,
        stage: 'Preparando',
        errorMessage: null,
      },
    });

    // --- Etapa 1: normalização -------------------------------------------
    const normalizedPaths: string[] = [];
    const probeAudio: boolean[] = [];
    const durations: number[] = [];
    const total = project.clips.length;

    for (const [index, clip] of project.clips.entries()) {
      const stage = `Normalizando clipe ${index + 1}/${total}`;
      log.info(`${projectId}: ${stage}`);

      const sourcePath = await storage.toLocalPath(clip.sourceKey);
      const info = await probeVideo(sourcePath);
      const durationSec = Math.min(
        info.durationSec,
        clip.maxDurationSec,
        config.limits.maxClipDurationSec,
      );

      const fileName = `clip-${index}.mp4`;
      const normalizedPath = path.join(assetsDir, fileName);

      const slice = (NORMALIZE_END - NORMALIZE_START) / total;
      await normalizeClip({
        input: sourcePath,
        output: normalizedPath,
        durationSec,
        hasAudio: info.hasAudio,
        width: config.video.width,
        height: config.video.height,
        fps: config.video.fps,
        onProgress: (ratio) => {
          const value = NORMALIZE_START + slice * (index + ratio);
          void setProgress(projectId, value, stage).catch(() => undefined);
        },
      });

      const normalizedKey = storageKeys.normalized(projectId, clip.id);
      await storage.put(normalizedKey, await fsp.readFile(normalizedPath));

      await prisma.clip.update({
        where: { id: clip.id },
        data: {
          normalizedKey,
          normalizedDurationSec: durationSec,
          sourceDurationSec: info.durationSec,
        },
      });

      normalizedPaths.push(normalizedPath);
      probeAudio.push(info.hasAudio);
      durations.push(durationSec);
    }

    // --- Etapa 2: transcrição (opcional por clipe) -----------------------
    const renderClips: RenderClip[] = [];
    const toTranscribe = project.clips
      .map((clip, index) => ({ clip, index }))
      .filter(({ clip }) => clip.transcribe);
    const captionsTotal = Math.max(toTranscribe.length, 1);

    for (const [index, clip] of project.clips.entries()) {
      let captions: RenderClip['captions'];
      let transcript: TranscriptResult | null = null;

      if (clip.transcribe) {
        const captionsIndex = toTranscribe.findIndex((item) => item.index === index);
        const stage = `Legendas clipe ${captionsIndex + 1}/${toTranscribe.length}`;
        log.info(`${projectId}: ${stage}`);

        const captionsSlice = (CAPTIONS_END - NORMALIZE_END) / captionsTotal;
        await setProgress(projectId, NORMALIZE_END + captionsSlice * captionsIndex, stage);

        if (!probeAudio[index]) {
          transcript = emptyTranscript();
          log.info(`${projectId}: clipe ${clip.id} sem áudio — legendas vazias`);
        } else {
          transcript = await transcribeClip({
            videoPath: normalizedPaths[index]!,
            workDir: captionsDir,
            clipId: clip.id,
          });
        }

        await prisma.clip.update({
          where: { id: clip.id },
          data: { transcriptJson: JSON.parse(JSON.stringify(transcript)) },
        });

        captions = transcriptToCaptions(transcript, config.video.fps);
        await setProgress(
          projectId,
          NORMALIZE_END + captionsSlice * (captionsIndex + 1),
          stage,
        );
      } else if (clip.transcriptJson !== null) {
        // Limpa transcript antigo se o toggle foi desligado (Prisma exige DbNull)
        await prisma.clip.update({
          where: { id: clip.id },
          data: { transcriptJson: Prisma.DbNull },
        });
      }

      renderClips.push({
        src: `${assets.baseUrl}/clip-${index}.mp4`,
        rank: total - index,
        label: clip.label,
        durationInFrames: Math.max(1, Math.round(durations[index]! * config.video.fps)),
        ...(captions && captions.length > 0 ? { captions } : {}),
      });
    }

    if (toTranscribe.length === 0) {
      await setProgress(projectId, CAPTIONS_END, 'Preparando render');
    }

    // --- Etapa 3: render --------------------------------------------------
    const props: TopListProps = {
      title: project.title,
      watermark: project.watermark,
      clips: renderClips,
    };

    await setProgress(projectId, CAPTIONS_END, 'Renderizando');
    log.info(`${projectId}: renderizando ${renderClips.length} clipes`);

    await renderTopList({
      props,
      outputPath,
      onProgress: (ratio) => {
        const value = CAPTIONS_END + (RENDER_END - CAPTIONS_END) * ratio;
        void setProgress(projectId, value, 'Renderizando').catch(() => undefined);
      },
    });

    // --- Etapa 4: publicação ----------------------------------------------
    const outputKey = storageKeys.output(projectId);
    await storage.put(outputKey, await fsp.readFile(outputPath));
    const stat = await fsp.stat(outputPath);

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.READY,
        progress: 100,
        stage: 'Concluído',
        outputKey,
        outputSizeByte: stat.size,
        renderedAt: new Date(),
      },
    });

    log.info(`${projectId}: pronto (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  } finally {
    await assets.close().catch(() => undefined);
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function markProjectFailed(projectId: string, message: string): Promise<void> {
  // updateMany: não lança se o projeto já foi apagado (job órfão na fila).
  const result = await prisma.project
    .updateMany({
      where: { id: projectId },
      data: {
        status: ProjectStatus.FAILED,
        stage: 'Falhou',
        errorMessage: message.slice(0, 1000),
      },
    })
    .catch((err: unknown) => {
      log.error(`Falha ao marcar projeto ${projectId} como FAILED`, err);
      return { count: 0 };
    });

  if (result.count === 0) {
    log.info(`Projeto ${projectId} não existe — nada a marcar como FAILED`);
  }
}
