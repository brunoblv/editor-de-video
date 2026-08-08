import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  config,
  getMidnightRecipe,
  getMidnightVariation,
  getStorage,
  MIDNIGHT_PIPELINE_VERSION,
  MIDNIGHT_RECIPE_VERSION,
  resolveEvents,
  resolveLayerVolumes,
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
import { validateProjectLicenses } from './license-guard.js';
import { ensureRecipesSeeded, PIPELINE_VERSION } from './recipes.js';
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
  recipeId: string | null;
  variationId: string | null;
  seed: number | null;
  ambientConfigJson: unknown;
}): {
  concept: AmbientConcept;
  recipeId: string;
  variationId: string;
  presetId: string;
  seed: number;
  layerVolumes: Record<string, number>;
  eventDefs: ReturnType<typeof resolveEvents>;
  configJson: Record<string, unknown>;
} {
  const configJson =
    project.ambientConfigJson && typeof project.ambientConfigJson === 'object'
      ? (project.ambientConfigJson as Record<string, unknown>)
      : {};

  const recipeIdRaw =
    (typeof configJson.recipeId === 'string' && configJson.recipeId) ||
    project.recipeId ||
    project.preset ||
    (project.conceptJson &&
    typeof project.conceptJson === 'object' &&
    typeof (project.conceptJson as AmbientConcept).recipeId === 'string'
      ? (project.conceptJson as AmbientConcept).recipeId
      : null);

  const variationIdRaw =
    (typeof configJson.variationId === 'string' && configJson.variationId) ||
    project.variationId ||
    (project.conceptJson &&
    typeof project.conceptJson === 'object' &&
    typeof (project.conceptJson as AmbientConcept).variationId === 'string'
      ? (project.conceptJson as AmbientConcept).variationId
      : null);

  if (project.conceptJson && typeof project.conceptJson === 'object') {
    const concept = { ...(project.conceptJson as AmbientConcept) };
    if (!concept.format) {
      concept.format = configJson.format === 'shorts' ? 'shorts' : 'youtube';
    }
    const recipe = getMidnightRecipe(recipeIdRaw ?? concept.recipeId);
    const variation = getMidnightVariation(recipe, variationIdRaw ?? concept.variationId);
    concept.recipeId = recipe.id;
    concept.variationId = variation.id;
    concept.universe = recipe.universe;
    concept.seriesId = recipe.seriesId;
    concept.seriesEpisode = recipe.episode;
    concept.playlists = recipe.playlists;
    concept.thumbnailStyle = recipe.thumbnailStyle;
    concept.mainSound = recipe.mainSound;
    concept.benefit = variation.benefit;
    concept.experience = recipe.experience;
    if (!concept.durationMinutes && project.durationMinutes) {
      concept.durationMinutes = project.durationMinutes;
    }
    return {
      concept,
      recipeId: recipe.id,
      variationId: variation.id,
      presetId: recipe.id,
      seed: project.seed ?? 438293,
      layerVolumes: resolveLayerVolumes(recipe, variation),
      eventDefs: resolveEvents(recipe, variation),
      configJson,
    };
  }

  const built = buildConcept({
    title: project.title,
    environment: project.environment ?? undefined,
    weather: project.weather ?? undefined,
    timeOfDay: project.timeOfDay ?? undefined,
    purpose: (project.purpose as AmbientConcept['purpose']) ?? undefined,
    durationMinutes: project.durationMinutes ?? undefined,
    recipeId: recipeIdRaw,
    preset: project.preset,
    variationId: variationIdRaw,
    seed: project.seed ?? undefined,
    autoConcept: Boolean(configJson.autoConcept),
    format: configJson.format === 'shorts' ? 'shorts' : 'youtube',
    audioLayers: Array.isArray(configJson.audioLayers)
      ? (configJson.audioLayers as string[])
      : undefined,
    visualQueries: Array.isArray(configJson.visualQueries)
      ? (configJson.visualQueries as string[])
      : undefined,
  });

  return {
    concept: built.concept,
    recipeId: built.recipeId,
    variationId: built.variationId,
    presetId: built.presetId,
    seed: built.seed,
    layerVolumes: built.layerVolumes,
    eventDefs: built.events,
    configJson,
  };
}

export async function runAmbientPipeline(
  projectId: string,
  mode: AmbientRenderMode = 'preview',
): Promise<void> {
  const storage = getStorage();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error(`Projeto ${projectId} não encontrado.`);

  const { concept, recipeId, variationId, presetId, seed, layerVolumes, eventDefs, configJson } =
    parseConcept(project);

  if (mode === 'generate_short') {
    concept.format = 'shorts';
  }

  const maxDurationMin = config.ambient.maxDurationMinutes;
  if ((concept.durationMinutes || 0) > maxDurationMin) {
    throw new Error(`Duração Ambient excede o máximo de ${maxDurationMin} minutos.`);
  }
  if ((concept.durationMinutes || 0) < 1 && mode !== 'generate_short') {
    throw new Error('Duração Ambient inválida.');
  }

  const autoSearch = configJson.autoSearch !== false;
  const wantThumbnail = configJson.generateThumbnail !== false;
  const wantMetadata = configJson.generateMetadata !== false;
  const wantQuality = configJson.qualityCheck !== false;

  const previewSec = config.ambient.previewDurationSec;
  const fullSec = Math.max(60, (concept.durationMinutes || 60) * 60);
  const shortSec = 25;
  const targetSec =
    mode === 'render'
      ? fullSec
      : mode === 'generate_short'
        ? shortSec
        : previewSec;

  const workDir = path.join(config.tmpDir, `ambient-${projectId}`);
  await fsp.rm(workDir, { recursive: true, force: true });
  await fsp.mkdir(workDir, { recursive: true });

  const audioDir = path.join(workDir, 'audio');
  const visualDir = path.join(workDir, 'visual');
  await fsp.mkdir(audioDir, { recursive: true });
  await fsp.mkdir(visualDir, { recursive: true });

  try {
    await ensureRecipesSeeded();

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.PROCESSING,
        progress: 2,
        stage: mode === 'generate_short' ? 'Gerando Short' : 'Planejando ambiente',
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
        recipeId,
        recipeVersion: MIDNIGHT_RECIPE_VERSION,
        pipelineVersion: PIPELINE_VERSION || MIDNIGHT_PIPELINE_VERSION,
        universe: concept.universe,
        variationId,
        seriesId: concept.seriesId,
        seriesEpisode: concept.seriesEpisode,
      },
    });

    if (mode === 'preview' || mode === 'regenerate_all') {
      await prisma.ambientProjectAsset.deleteMany({ where: { projectId } });
    }

    const needAudio =
      mode === 'preview' ||
      mode === 'render' ||
      mode === 'regenerate_audio' ||
      mode === 'regenerate_all' ||
      mode === 'generate_short';
    const needVisual =
      mode === 'preview' ||
      mode === 'regenerate_visual' ||
      mode === 'regenerate_all' ||
      mode === 'generate_short';

    let audioMasterPath = '';
    let visualMasterPath = '';
    let audioTimeline = project.audioTimelineJson as AmbientAudioTimeline | null;
    let visualTimeline = project.visualTimelineJson as AmbientVisualTimeline | null;

    if (needAudio && mode !== 'render') {
      await setProgress(projectId, 12, 'Construindo soundscape');
      log.info(`${projectId}: soundscape ${targetSec}s seed=${seed} recipe=${recipeId}`);
      const built = await buildSoundscape({
        concept,
        presetId,
        seed,
        durationSec: targetSec,
        workDir: audioDir,
        layerVolumes,
        eventDefs,
      });
      audioMasterPath = built.masterPath;
      audioTimeline = built.timeline;
      await storage.put(
        storageKeys.ambientAudioMaster(projectId),
        await fsp.readFile(audioMasterPath),
      );

      if (mode === 'regenerate_audio') {
        await prisma.ambientProjectAsset.deleteMany({
          where: { projectId, type: { in: ['audio', 'SOUND_LIBRARY', 'SOUND_SYNTH'] } },
        });
      }

      for (const layer of built.timeline.layers) {
        await prisma.ambientProjectAsset.create({
          data: {
            projectId,
            assetId: layer.assetId ?? null,
            type: layer.source === 'library' ? 'SOUND_LIBRARY' : 'SOUND_SYNTH',
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
      await setProgress(projectId, 12, 'Construindo soundscape completo');
      const built = await buildSoundscape({
        concept,
        presetId,
        seed,
        durationSec: fullSec,
        workDir: audioDir,
        layerVolumes,
        eventDefs,
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

    if (mode === 'render') {
      const key = storageKeys.ambientVisualMaster(projectId);
      if (await storage.exists(key)) {
        visualMasterPath = await storage.toLocalPath(key);
      } else {
        await setProgress(projectId, 48, 'Construindo visual');
        const built = await buildVisualMaster({
          concept,
          workDir: visualDir,
          masterDurationSec: 45,
          autoSearch,
        });
        visualMasterPath = built.visualMasterPath;
        visualTimeline = built.timeline;
        await storage.put(key, await fsp.readFile(visualMasterPath));
        await prisma.project.update({
          where: { id: projectId },
          data: { visualTimelineJson: built.timeline as unknown as Prisma.InputJsonValue },
        });
      }
    } else if (needVisual) {
      const existingVisual = storageKeys.ambientVisualMaster(projectId);
      if (mode === 'generate_short' && (await storage.exists(existingVisual))) {
        visualMasterPath = await storage.toLocalPath(existingVisual);
        visualTimeline = project.visualTimelineJson as AmbientVisualTimeline;
      } else {
        await setProgress(projectId, 48, 'Construindo visual');
        const built = await buildVisualMaster({
          concept,
          workDir: visualDir,
          masterDurationSec: Math.min(45, Math.max(targetSec, 20)),
          autoSearch,
        });
        visualMasterPath = built.visualMasterPath;
        visualTimeline = built.timeline;
        await storage.put(
          storageKeys.ambientVisualMaster(projectId),
          await fsp.readFile(visualMasterPath),
        );

        if (mode === 'regenerate_visual') {
          await prisma.ambientProjectAsset.deleteMany({
            where: { projectId, type: { in: ['visual', 'VISUAL_STOCK', 'VISUAL_SYNTH'] } },
          });
          await prisma.mediaAsset.deleteMany({ where: { projectId } });
        }

        let position = 0;
        for (const clip of built.timeline.clips) {
          let mediaId: string | null = null;
          if (clip.provider && clip.sourceUrl) {
            const media = await prisma.mediaAsset.create({
              data: {
                projectId,
                provider: clip.provider,
                sourceUrl: clip.sourceUrl,
                author: clip.author ?? null,
                license: clip.license ?? null,
                query: clip.query,
                localKey: null,
                durationSec: clip.durationSec,
                position: position++,
              },
            });
            mediaId = media.id;
          }

          await prisma.ambientProjectAsset.create({
            data: {
              projectId,
              type: clip.provider ? 'VISUAL_STOCK' : 'VISUAL_SYNTH',
              layer: 'main',
              startTime: 0,
              endTime: clip.durationSec,
              volume: 1,
              metadataJson: {
                ...clip,
                mediaAssetId: mediaId,
              } as unknown as Prisma.InputJsonValue,
            },
          });
        }

        await prisma.project.update({
          where: { id: projectId },
          data: { visualTimelineJson: built.timeline as unknown as Prisma.InputJsonValue },
        });

        if (wantThumbnail) {
          const thumbPath = path.join(workDir, 'thumbnail.jpg');
          await generateThumbnail({ visualMasterPath, outputPath: thumbPath });
          await storage.put(
            storageKeys.ambientThumbnail(projectId),
            await fsp.readFile(thumbPath),
          );
        }
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

    const licenseReport = await validateProjectLicenses(projectId);
    if (!licenseReport.safe) {
      const blocked = licenseReport.blocked.map((b) => `${b.name} (${b.verdict})`).join(', ');
      throw new Error(`License Guard bloqueou o render: ${blocked}`);
    }

    const audioAttributions = licenseReport.attributionRequired
      .filter((a) => a.kind === 'sound' && a.attribution)
      .map((a) => a.attribution!)
      .concat(
        licenseReport.assets
          .filter((a) => a.kind === 'media' && a.attribution)
          .map((a) => `${a.name}: ${a.attribution}`),
      );

    if (mode === 'render' || mode === 'generate_short') {
      const durationSec = mode === 'generate_short' ? shortSec : fullSec;
      await setProgress(
        projectId,
        70,
        mode === 'generate_short' ? 'Renderizando Short' : 'Renderizando vídeo longo',
      );
      const outputPath = path.join(
        workDir,
        mode === 'generate_short' ? 'short.mp4' : 'final.mp4',
      );
      await muxAmbient({
        visualMasterPath,
        audioMasterPath,
        durationSec,
        outputPath,
      });

      let report = {
        audioQuality: 0,
        loopQuality: 0,
        atmosphere: 0,
        visualQuality: 0,
        licenseSafety: licenseReport.safe ? 100 : 40,
        total: 0,
        passed: false,
        notes: ['Quality check desativado'],
      };
      if (wantQuality) {
        await setProgress(projectId, 90, 'Quality check');
        report = await runQualityCheck({
          audioPath: audioMasterPath,
          visualPath: visualMasterPath,
          outputPath,
          expectedDurationSec: durationSec,
          audioTimeline: audioTimeline!,
          visualTimeline: visualTimeline!,
          licenseSafe: licenseReport.safe,
        });
      }

      const outputKey = storageKeys.output(projectId);
      await storage.put(outputKey, await fsp.readFile(outputPath));
      const stat = await fsp.stat(outputPath);
      const metadata = wantMetadata
        ? buildMetadata({
            concept,
            audioTimeline: audioTimeline!,
            visualTimeline: visualTimeline!,
            attributions: audioAttributions,
          })
        : null;

      await prisma.project.update({
        where: { id: projectId },
        data: {
          status: ProjectStatus.READY_FOR_REVIEW,
          progress: 100,
          stage: mode === 'generate_short' ? 'Short pronto para revisão' : 'Pronto para revisão',
          outputKey,
          outputSizeByte: stat.size,
          renderedAt: new Date(),
          qualityScore: report.total,
          qualityJson: report as unknown as Prisma.InputJsonValue,
          metadataJson: metadata
            ? (metadata as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });

      log.info(
        `${projectId}: READY_FOR_REVIEW (${(stat.size / 1024 / 1024).toFixed(1)} MB) mode=${mode}`,
      );
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

    await probe(audioMasterPath);

    let report = {
      audioQuality: 0,
      loopQuality: 0,
      atmosphere: 0,
      visualQuality: 0,
      licenseSafety: licenseReport.safe ? 100 : 40,
      total: 0,
      passed: false,
      notes: ['Quality check desativado'],
    };
    if (wantQuality) {
      await setProgress(projectId, 92, 'Quality check');
      report = await runQualityCheck({
        audioPath: audioMasterPath,
        visualPath: visualMasterPath,
        outputPath: previewPath,
        expectedDurationSec: targetSec,
        audioTimeline: audioTimeline!,
        visualTimeline: visualTimeline!,
        licenseSafe: licenseReport.safe,
      });
    }

    const previewKey = storageKeys.ambientPreview(projectId);
    await storage.put(previewKey, await fsp.readFile(previewPath));
    const stat = await fsp.stat(previewPath);
    const metadata = wantMetadata
      ? buildMetadata({
          concept,
          audioTimeline: audioTimeline!,
          visualTimeline: visualTimeline!,
          attributions: audioAttributions,
        })
      : null;

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
        metadataJson: metadata
          ? (metadata as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    log.info(`${projectId}: WAITING_PREVIEW_APPROVAL score=${report.total}`);
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
