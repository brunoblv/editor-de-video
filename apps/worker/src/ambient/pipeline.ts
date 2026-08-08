import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  config,
  getStorage,
  storageKeys,
  type AmbientAudioTimeline,
  type AmbientConcept,
  type AmbientRenderMode,
  type AmbientVisualTimeline,
} from '@editor-video/core';
import { Prisma } from '@prisma/client';
import { prisma, ProjectStatus } from '@editor-video/db';
import { probe } from '../ffmpeg.js';
import { logger } from '../logger.js';
import { buildConcept } from './concept.js';
import { buildMetadata } from './metadata.js';
import { runQualityCheck } from './quality.js';
import { buildSoundscape } from './soundscape.js';
import { buildVisualMaster, generateThumbnail, muxAmbient } from './visual.js';

const log = logger('ambient');

async function setProgress(projectId: string, progress: number, stage: string): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: { progress: Math.round(progress), stage },
  });
}

function parseConcept(project: {
  conceptJson: unknown;
  title: string;
  environment: string | null;
  weather: string | null;
  timeOfDay: string | null;
  purpose: string | null;
  durationMinutes: number | null;
  preset: string | null;
  seed: number | null;
  ambientConfigJson: unknown;
}): { concept: AmbientConcept; presetId: string | null; seed: number } {
  if (project.conceptJson && typeof project.conceptJson === 'object') {
    return {
      concept: project.conceptJson as AmbientConcept,
      presetId: project.preset,
      seed: project.seed ?? 438293,
    };
  }

  const configJson =
    project.ambientConfigJson && typeof project.ambientConfigJson === 'object'
      ? (project.ambientConfigJson as Record<string, unknown>)
      : {};

  return buildConcept({
    title: project.title,
    environment: project.environment ?? undefined,
    weather: project.weather ?? undefined,
    timeOfDay: project.timeOfDay ?? undefined,
    purpose: (project.purpose as AmbientConcept['purpose']) ?? undefined,
    durationMinutes: project.durationMinutes ?? undefined,
    preset: project.preset,
    seed: project.seed ?? undefined,
    autoConcept: Boolean(configJson.autoConcept),
    audioLayers: Array.isArray(configJson.audioLayers)
      ? (configJson.audioLayers as string[])
      : undefined,
    visualQueries: Array.isArray(configJson.visualQueries)
      ? (configJson.visualQueries as string[])
      : undefined,
  });
}

export async function runAmbientPipeline(
  projectId: string,
  mode: AmbientRenderMode = 'preview',
): Promise<void> {
  const storage = getStorage();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error(`Projeto ${projectId} não encontrado.`);

  const { concept, presetId, seed } = parseConcept(project);
  const previewSec = config.ambient.previewDurationSec;
  const fullSec = Math.max(60, (concept.durationMinutes || 60) * 60);
  const targetSec = mode === 'render' ? fullSec : previewSec;

  const workDir = path.join(config.tmpDir, `ambient-${projectId}`);
  await fsp.rm(workDir, { recursive: true, force: true });
  await fsp.mkdir(workDir, { recursive: true });

  const audioDir = path.join(workDir, 'audio');
  const visualDir = path.join(workDir, 'visual');
  await fsp.mkdir(audioDir, { recursive: true });
  await fsp.mkdir(visualDir, { recursive: true });

  try {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.PROCESSING,
        progress: 2,
        stage: 'Planejando ambiente',
        errorMessage: null,
        title: concept.title.slice(0, 80),
        environment: concept.environment,
        weather: concept.weather,
        timeOfDay: concept.time,
        purpose: concept.purpose,
        durationMinutes: concept.durationMinutes,
        preset: presetId,
        seed,
        conceptJson: concept as unknown as Prisma.InputJsonValue,
      },
    });

    if (mode === 'preview' || mode === 'regenerate_all') {
      await prisma.ambientProjectAsset.deleteMany({ where: { projectId } });
    }

    const needAudio =
      mode === 'preview' ||
      mode === 'render' ||
      mode === 'regenerate_audio' ||
      mode === 'regenerate_all';
    const needVisual =
      mode === 'preview' ||
      mode === 'render' ||
      mode === 'regenerate_visual' ||
      mode === 'regenerate_all';

    let audioMasterPath = '';
    let visualMasterPath = '';
    let audioTimeline = project.audioTimelineJson as AmbientAudioTimeline | null;
    let visualTimeline = project.visualTimelineJson as AmbientVisualTimeline | null;

    if (needAudio && mode !== 'render') {
      await setProgress(projectId, 12, 'Construindo soundscape');
      log.info(`${projectId}: soundscape ${targetSec}s seed=${seed}`);
      const built = await buildSoundscape({
        concept,
        presetId,
        seed,
        durationSec: targetSec,
        workDir: audioDir,
      });
      audioMasterPath = built.masterPath;
      audioTimeline = built.timeline;
      await storage.put(
        storageKeys.ambientAudioMaster(projectId),
        await fsp.readFile(audioMasterPath),
      );

      if (mode === 'regenerate_audio') {
        await prisma.ambientProjectAsset.deleteMany({
          where: { projectId, type: 'audio' },
        });
      }

      for (const layer of built.timeline.layers) {
        await prisma.ambientProjectAsset.create({
          data: {
            projectId,
            assetId: layer.assetId ?? null,
            type: 'audio',
            layer: layer.kind,
            startTime: 0,
            endTime: targetSec,
            volume: layer.volume,
            metadataJson: layer as unknown as Prisma.InputJsonValue,
          },
        });
      }

      await prisma.project.update({
        where: { id: projectId },
        data: { audioTimelineJson: built.timeline as unknown as Prisma.InputJsonValue },
      });
    } else if (mode === 'render') {
      // Render longo: sempre gera áudio na duração completa (seed preservado).
      await setProgress(projectId, 12, 'Construindo soundscape completo');
      const built = await buildSoundscape({
        concept,
        presetId,
        seed,
        durationSec: fullSec,
        workDir: audioDir,
      });
      audioMasterPath = built.masterPath;
      audioTimeline = built.timeline;
      await storage.put(
        storageKeys.ambientAudioMaster(projectId),
        await fsp.readFile(audioMasterPath),
      );
      await prisma.project.update({
        where: { id: projectId },
        data: { audioTimelineJson: built.timeline as unknown as Prisma.InputJsonValue },
      });
    } else {
      const key = storageKeys.ambientAudioMaster(projectId);
      if (!(await storage.exists(key))) {
        throw new Error('Áudio master ausente — regenere o áudio.');
      }
      audioMasterPath = await storage.toLocalPath(key);
    }

    if (needVisual && mode !== 'render') {
      await setProgress(projectId, 48, 'Construindo visual');
      const built = await buildVisualMaster({
        concept,
        workDir: visualDir,
        masterDurationSec: Math.min(45, targetSec),
      });
      visualMasterPath = built.visualMasterPath;
      visualTimeline = built.timeline;
      await storage.put(
        storageKeys.ambientVisualMaster(projectId),
        await fsp.readFile(visualMasterPath),
      );

      if (mode === 'regenerate_visual') {
        await prisma.ambientProjectAsset.deleteMany({
          where: { projectId, type: 'visual' },
        });
      }

      for (const clip of built.timeline.clips) {
        await prisma.ambientProjectAsset.create({
          data: {
            projectId,
            type: 'visual',
            layer: 'main',
            startTime: 0,
            endTime: clip.durationSec,
            volume: 1,
            metadataJson: clip as unknown as Prisma.InputJsonValue,
          },
        });
      }

      await prisma.project.update({
        where: { id: projectId },
        data: { visualTimelineJson: built.timeline as unknown as Prisma.InputJsonValue },
      });

      const thumbPath = path.join(workDir, 'thumbnail.jpg');
      await generateThumbnail({ visualMasterPath, outputPath: thumbPath });
      await storage.put(storageKeys.ambientThumbnail(projectId), await fsp.readFile(thumbPath));
    } else if (mode === 'render') {
      const key = storageKeys.ambientVisualMaster(projectId);
      if (await storage.exists(key)) {
        visualMasterPath = await storage.toLocalPath(key);
      } else {
        await setProgress(projectId, 48, 'Construindo visual');
        const built = await buildVisualMaster({
          concept,
          workDir: visualDir,
          masterDurationSec: 45,
        });
        visualMasterPath = built.visualMasterPath;
        visualTimeline = built.timeline;
        await storage.put(key, await fsp.readFile(visualMasterPath));
        await prisma.project.update({
          where: { id: projectId },
          data: { visualTimelineJson: built.timeline as unknown as Prisma.InputJsonValue },
        });
      }
    } else {
      const key = storageKeys.ambientVisualMaster(projectId);
      if (!(await storage.exists(key))) {
        throw new Error('Visual master ausente — regenere o visual.');
      }
      visualMasterPath = await storage.toLocalPath(key);
    }

    if (!audioTimeline) {
      audioTimeline = project.audioTimelineJson as AmbientAudioTimeline;
    }
    if (!visualTimeline) {
      visualTimeline = project.visualTimelineJson as AmbientVisualTimeline;
    }

    if (mode === 'render') {
      await setProgress(projectId, 70, 'Renderizando vídeo longo');
      const outputPath = path.join(workDir, 'final.mp4');
      await muxAmbient({
        visualMasterPath,
        audioMasterPath,
        durationSec: fullSec,
        outputPath,
      });

      await setProgress(projectId, 90, 'Quality check');
      const report = await runQualityCheck({
        audioPath: audioMasterPath,
        visualPath: visualMasterPath,
        outputPath,
        expectedDurationSec: fullSec,
        audioTimeline: audioTimeline!,
        visualTimeline: visualTimeline!,
        licenseSafe: true,
      });

      const outputKey = storageKeys.output(projectId);
      await storage.put(outputKey, await fsp.readFile(outputPath));
      const stat = await fsp.stat(outputPath);
      const metadata = buildMetadata({
        concept,
        audioTimeline: audioTimeline!,
        visualTimeline: visualTimeline!,
      });

      await prisma.project.update({
        where: { id: projectId },
        data: {
          status: ProjectStatus.READY_FOR_REVIEW,
          progress: 100,
          stage: 'Pronto para revisão',
          outputKey,
          outputSizeByte: stat.size,
          renderedAt: new Date(),
          qualityScore: report.total,
          qualityJson: report as unknown as Prisma.InputJsonValue,
          metadataJson: metadata as unknown as Prisma.InputJsonValue,
        },
      });

      log.info(`${projectId}: READY_FOR_REVIEW (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
      return;
    }

    await setProgress(projectId, 78, 'Gerando preview');
    const previewPath = path.join(workDir, 'preview.mp4');
    await muxAmbient({
      visualMasterPath,
      audioMasterPath,
      durationSec: targetSec,
      outputPath: previewPath,
    });

    // Confirma duração do áudio (sanity)
    await probe(audioMasterPath);

    await setProgress(projectId, 92, 'Quality check');
    const report = await runQualityCheck({
      audioPath: audioMasterPath,
      visualPath: visualMasterPath,
      outputPath: previewPath,
      expectedDurationSec: targetSec,
      audioTimeline: audioTimeline!,
      visualTimeline: visualTimeline!,
      licenseSafe: true,
    });

    const previewKey = storageKeys.ambientPreview(projectId);
    await storage.put(previewKey, await fsp.readFile(previewPath));
    const stat = await fsp.stat(previewPath);
    const metadata = buildMetadata({
      concept,
      audioTimeline: audioTimeline!,
      visualTimeline: visualTimeline!,
    });

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.WAITING_PREVIEW_APPROVAL,
        progress: 100,
        stage: 'Aguardando aprovação do preview',
        previewKey,
        outputSizeByte: stat.size,
        qualityScore: report.total,
        qualityJson: report as unknown as Prisma.InputJsonValue,
        metadataJson: metadata as unknown as Prisma.InputJsonValue,
      },
    });

    log.info(`${projectId}: WAITING_PREVIEW_APPROVAL score=${report.total}`);
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
