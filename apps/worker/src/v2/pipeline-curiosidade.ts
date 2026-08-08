import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  config,
  getStorage,
  storageKeys,
  type CuriosidadeProps,
} from '@editor-video/core';
import { Prisma } from '@prisma/client';
import { prisma, ProjectStatus } from '@editor-video/db';
import { normalizeClip, probe } from '../ffmpeg.js';
import { logger } from '../logger.js';
import { renderCuriosidade } from '../render.js';
import { serveDirectory } from '../static-server.js';
import { transcriptToCaptions, transcribeWav } from '../whisper.js';
import { downloadFile } from './download.js';
import { searchBestStock } from './media-search.js';
import { generateScript } from './script.js';
import { synthesizeSpeech } from './tts.js';

const log = logger('curiosidade');

async function setProgress(projectId: string, progress: number, stage: string): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: { progress: Math.round(progress), stage },
  });
}

/** Distribui a duração da narração entre N cenas (cortes mais rápidos no início). */
function sceneDurations(totalSec: number, count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [totalSec];

  const weights = Array.from({ length: count }, (_, i) => (i < 2 ? 0.7 : 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (totalSec * w) / sum);
  // Garante mínimo ~2s e ajusta o último para fechar a soma
  const capped = raw.map((d) => Math.max(2, d));
  const cappedSum = capped.reduce((a, b) => a + b, 0);
  const scaled = capped.map((d) => (d / cappedSum) * totalSec);
  const head = scaled.slice(0, -1);
  const last = totalSec - head.reduce((a, b) => a + b, 0);
  return [...head, Math.max(1.5, last)];
}

export async function runCuriosidadePipeline(projectId: string): Promise<void> {
  const storage = getStorage();

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error(`Projeto ${projectId} não encontrado.`);
  if (!project.topic?.trim()) {
    throw new Error('Projeto Curiosidade sem tema (topic).');
  }

  const workDir = path.join(config.tmpDir, `curiosidade-${projectId}`);
  const assetsDir = path.join(workDir, 'assets');
  const mediaDir = path.join(workDir, 'media');
  const whisperDir = path.join(workDir, 'whisper');
  const outputPath = path.join(workDir, 'final.mp4');
  const voiceoverPath = path.join(workDir, 'voiceover.wav');

  await fsp.rm(workDir, { recursive: true, force: true });
  await fsp.mkdir(assetsDir, { recursive: true });
  await fsp.mkdir(mediaDir, { recursive: true });
  await fsp.mkdir(whisperDir, { recursive: true });

  const assets = await serveDirectory(assetsDir);

  try {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.PROCESSING,
        progress: 3,
        stage: 'Gerando roteiro',
        errorMessage: null,
      },
    });

    // 1) Roteiro
    log.info(`${projectId}: gerando roteiro para "${project.topic}"`);
    const script = await generateScript(project.topic);
    await prisma.project.update({
      where: { id: projectId },
      data: {
        scriptJson: script as unknown as Prisma.InputJsonValue,
        title: script.title.slice(0, 80),
      },
    });
    await setProgress(projectId, 12, 'Buscando mídia');

    // Limpa assets anteriores em re-renders
    await prisma.mediaAsset.deleteMany({ where: { projectId } });

    // 2) Busca + download + normalização
    const usedUrls = new Set<string>();
    const normalizedFiles: string[] = [];
    const needs = script.visualNeeds;
    const totalNeeds = Math.max(needs.length, 1);

    for (const [index, need] of needs.entries()) {
      const stage = `Mídia ${index + 1}/${needs.length}: ${need.query}`;
      log.info(`${projectId}: ${stage}`);
      await setProgress(projectId, 12 + (38 * index) / totalNeeds, stage);

      const hit = await searchBestStock(need.query, usedUrls);
      usedUrls.add(hit.downloadUrl);
      usedUrls.add(hit.sourceUrl);

      const ext = path.extname(new URL(hit.downloadUrl).pathname) || '.mp4';
      const asset = await prisma.mediaAsset.create({
        data: {
          projectId,
          provider: hit.provider,
          sourceUrl: hit.sourceUrl,
          author: hit.author,
          license: hit.license,
          query: need.query,
          position: index,
          scriptStartSec: need.startSec,
          scriptEndSec: need.endSec,
          width: hit.width,
          height: hit.height,
          durationSec: hit.durationSec,
        },
      });

      const rawPath = path.join(mediaDir, `${asset.id}${ext}`);
      await downloadFile(hit.downloadUrl, rawPath);

      const info = await probe(rawPath);
      const takeSec = Math.min(info.durationSec, 12);
      const fileName = `scene-${index}.mp4`;
      const normalizedPath = path.join(assetsDir, fileName);

      await normalizeClip({
        input: rawPath,
        output: normalizedPath,
        durationSec: takeSec,
        hasAudio: info.hasAudio,
        width: config.video.width,
        height: config.video.height,
        fps: config.video.fps,
      });

      const localKey = storageKeys.media(projectId, asset.id, ext);
      const normalizedKey = storageKeys.mediaNormalized(projectId, asset.id);
      await storage.put(localKey, await fsp.readFile(rawPath));
      await storage.put(normalizedKey, await fsp.readFile(normalizedPath));

      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          localKey,
          durationSec: takeSec,
          width: config.video.width,
          height: config.video.height,
        },
      });

      normalizedFiles.push(normalizedPath);
    }

    // 3) TTS
    await setProgress(projectId, 55, 'Gerando narração');
    log.info(`${projectId}: Piper TTS`);
    await synthesizeSpeech(script.narration, voiceoverPath);
    const voiceInfo = await probe(voiceoverPath);
    const voiceSec = Math.max(voiceInfo.durationSec, config.curiosidade.minDurationSec * 0.6);
    const voiceoverKey = storageKeys.voiceover(projectId);
    await storage.put(voiceoverKey, await fsp.readFile(voiceoverPath));
    await prisma.project.update({
      where: { id: projectId },
      data: { voiceoverKey },
    });

    // 4) Legendas (Whisper no WAV)
    await setProgress(projectId, 68, 'Gerando legendas');
    log.info(`${projectId}: Whisper na narração`);
    let captions: CuriosidadeProps['captions'] = [];
    try {
      const transcript = await transcribeWav({
        wavPath: voiceoverPath,
        workDir: whisperDir,
        id: 'voiceover',
      });
      captions = transcriptToCaptions(transcript, config.video.fps);
    } catch (err) {
      log.error(`${projectId}: Whisper falhou — seguindo sem legendas`, err);
    }

    // 5) Monta cenas com duração proporcional à narração
    const durations = sceneDurations(voiceSec, normalizedFiles.length);
    const scenes = normalizedFiles.map((filePath, index) => ({
      src: `${assets.baseUrl}/${path.basename(filePath)}`,
      durationInFrames: Math.max(1, Math.round(durations[index]! * config.video.fps)),
    }));

    // Copia voiceover para a pasta servida
    const voiceFileName = 'voiceover.wav';
    await fsp.copyFile(voiceoverPath, path.join(assetsDir, voiceFileName));

    const props: CuriosidadeProps = {
      title: script.title,
      watermark: project.watermark,
      hookText: script.hook,
      voiceoverUrl: `${assets.baseUrl}/${voiceFileName}`,
      scenes,
      captions,
    };

    // 6) Render
    await setProgress(projectId, 78, 'Renderizando');
    log.info(`${projectId}: render Curiosidade (${scenes.length} cenas, ${voiceSec.toFixed(1)}s)`);

    await renderCuriosidade({
      props,
      outputPath,
      onProgress: (ratio) => {
        void setProgress(projectId, 78 + 20 * ratio, 'Renderizando').catch(() => undefined);
      },
    });

    const outputKey = storageKeys.output(projectId);
    await storage.put(outputKey, await fsp.readFile(outputPath));
    const stat = await fsp.stat(outputPath);

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.READY_FOR_REVIEW,
        progress: 100,
        stage: 'Pronto para revisão',
        outputKey,
        outputSizeByte: stat.size,
        renderedAt: new Date(),
      },
    });

    log.info(`${projectId}: READY_FOR_REVIEW (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  } finally {
    await assets.close().catch(() => undefined);
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
