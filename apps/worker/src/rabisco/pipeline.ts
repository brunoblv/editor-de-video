import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  config,
  getStorage,
  repoRoot,
  resolveCaptionStyle,
  storageKeys,
  RABISCO_ACTIONS,
  resolveRabiscoPose,
  type RabiscoAction,
  type CaptionSegment,
  type CaptionStyle,
  type RabiscoProps,
  type RabiscoScene,
} from '@editor-video/core';
import { Prisma } from '@prisma/client';
import { prisma, ProjectStatus } from '@editor-video/db';
import { probe } from '../ffmpeg.js';
import { logger } from '../logger.js';
import { renderRabisco } from '../render.js';
import { serveDirectory } from '../static-server.js';
import { transcriptToCaptions, transcribeWav } from '../captions.js';
import { synthesizePlainNarration } from '../voice/synth.js';
import { pickRandomTrack } from '../christian/music.js';
import { generateReflection, type GeneratedCharacterScene } from './gemini.js';
import { RABISCO_PROMPT_VERSION } from './prompts/content.js';

const log = logger('rabisco');

async function setProgress(projectId: string, progress: number, stage: string): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: { progress: Math.round(progress), stage },
  });
}

/**
 * Converte cenas em segundos (relativas ao roteiro gerado pelo LLM) para
 * frames absolutos, escalando pela duração real da narração já sintetizada —
 * o LLM estima startSec/endSec antes do áudio existir, então nunca bate
 * exatamente com o TTS real; escalar proporcionalmente evita que a última
 * cena termine antes (ou muito depois) do fim de fato da narração.
 */
function scenesToFrames(
  scenes: GeneratedCharacterScene[],
  voiceSec: number,
  fps: number,
  assetUrls: Record<RabiscoAction, string>,
): RabiscoScene[] {
  const scriptEnd = Math.max(...scenes.map((scene) => scene.endSec), 0.1);
  const scale = voiceSec / scriptEnd;

  return scenes.map((scene) => {
    const startFrame = Math.round(scene.startSec * scale * fps);
    const endFrame = Math.round(scene.endSec * scale * fps);
    return {
      startFrame,
      durationInFrames: Math.max(1, endFrame - startFrame),
      emotion: scene.emotion,
      action: scene.action,
      position: scene.position,
      animation: scene.animation,
      thought: scene.thought,
      assetUrl: assetUrls[scene.action],
    };
  });
}

/**
 * Copia os PNGs do personagem referenciados pelas cenas para a pasta de
 * assets efêmera do worker e retorna a URL absoluta servida durante o
 * render — o Remotion não enxerga `apps/web/public`, então os assets do
 * Rabisco precisam do mesmo tratamento que voiceoverUrl/scenes/música.
 */
async function copyCharacterAssets(
  actions: RabiscoAction[],
  assetsDir: string,
  baseUrl: string,
): Promise<Record<RabiscoAction, string>> {
  const publicDir = path.join(repoRoot, 'apps', 'web', 'public');

  // serveDirectory() serve tudo "achatado" (resolve só o basename da URL
  // contra a raiz de assetsDir) — nada de subpasta aqui, mesmo tratamento
  // dado a scene-N.mp4/voiceover.wav/music.*.
  //
  // Várias ações compartilham a mesma pose real (RABISCO_ACTION_POSE) — copia
  // uma vez por pose, não por ação, pra não duplicar o mesmo PNG no disco.
  const urls: Partial<Record<RabiscoAction, string>> = {};
  const copiedPoses = new Set<string>();
  for (const action of new Set(actions)) {
    const pose = resolveRabiscoPose(action);
    const fileName = `character-${pose}.png`;
    if (!copiedPoses.has(pose)) {
      const srcPath = path.join(publicDir, RABISCO_ACTIONS[action]);
      await fsp.copyFile(srcPath, path.join(assetsDir, fileName));
      copiedPoses.add(pose);
    }
    urls[action] = `${baseUrl}/${fileName}`;
  }
  return urls as Record<RabiscoAction, string>;
}

export async function runRabiscoPipeline(projectId: string): Promise<void> {
  const storage = getStorage();

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error(`Projeto ${projectId} não encontrado.`);
  if (!project.rabiscoThought?.trim()) {
    throw new Error('Projeto Rabisco sem pensamento (rabiscoThought) — nada para gerar.');
  }

  const workDir = path.join(config.tmpDir, `rabisco-${projectId}`);
  const assetsDir = path.join(workDir, 'assets');
  const captionsDir = path.join(workDir, 'captions');
  const outputPath = path.join(workDir, 'final.mp4');
  const voiceoverPath = path.join(workDir, 'voiceover.wav');

  await fsp.rm(workDir, { recursive: true, force: true });
  await fsp.mkdir(assetsDir, { recursive: true });
  await fsp.mkdir(captionsDir, { recursive: true });

  const assets = await serveDirectory(assetsDir);

  try {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.PROCESSING,
        progress: 2,
        stage: 'Escrevendo a reflexão',
        errorMessage: null,
      },
    });

    // 1) Roteiro + direção de cena via Gemini (RABISCO.md §4.2, §5)
    log.info(`${projectId}: gerando reflexão`);
    const generated = await generateReflection({ thought: project.rabiscoThought });

    // 2) Todo asset referenciado precisa existir — falhar cedo, não no render.
    for (const scene of generated.characterScenes) {
      if (!RABISCO_ACTIONS[scene.action]) {
        throw new Error(`Cena do Rabisco referencia ação desconhecida: "${scene.action}".`);
      }
    }

    await prisma.project.update({
      where: { id: projectId },
      data: {
        title: generated.title.slice(0, 80),
        rabiscoScriptJson: generated as unknown as Prisma.InputJsonValue,
        characterScenesJson: generated.characterScenes as unknown as Prisma.InputJsonValue,
        rabiscoPromptVersion: RABISCO_PROMPT_VERSION,
      },
    });

    // 3) Uma única tomada evita pausas artificiais entre segmentos.
    await setProgress(projectId, 40, 'Gerando narração');
    await synthesizePlainNarration(
      generated.narration,
      voiceoverPath,
      path.join(workDir, 'voice-parts'),
      'Fale em português do Brasil, com voz calma, íntima e natural. Mantenha uma única narração contínua, com pausas breves apenas onde a pontuação pedir.',
    );
    log.info(`${projectId}: narração contínua gerada via Gemini TTS`);
    const voiceInfo = await probe(voiceoverPath);
    const voiceSec = Math.max(voiceInfo.durationSec, config.rabisco.minDurationSec * 0.6);
    const voiceoverKey = storageKeys.voiceover(projectId);
    await storage.put(voiceoverKey, await fsp.readFile(voiceoverPath));
    await prisma.project.update({ where: { id: projectId }, data: { voiceoverKey } });

    // 4) Legendas
    await setProgress(projectId, 62, 'Gerando legendas');
    let captions: CaptionSegment[] = [];
    try {
      const transcript = await transcribeWav({
        wavPath: voiceoverPath,
        workDir: captionsDir,
        id: 'voiceover',
        hintText: generated.narration,
        durationSec: voiceInfo.durationSec,
      });
      captions = transcriptToCaptions(transcript, config.video.fps);
    } catch (err) {
      log.error(`${projectId}: legendas falharam — seguindo sem legendas`, err);
    }

    // 5) Cenas do personagem — copia os PNGs usados e escala segundos do roteiro pra duração real do áudio
    const usedActions = generated.characterScenes.map((scene) => scene.action);
    const assetUrls = await copyCharacterAssets(usedActions, assetsDir, assets.baseUrl);
    const scenes = scenesToFrames(generated.characterScenes, voiceSec, config.video.fps, assetUrls);

    const voiceFileName = 'voiceover.wav';
    await fsp.copyFile(voiceoverPath, path.join(assetsDir, voiceFileName));

    const musicTrackPath = await pickRandomTrack();
    let musicUrl: string | null = null;
    if (musicTrackPath) {
      const musicFileName = `music${path.extname(musicTrackPath)}`;
      await fsp.copyFile(musicTrackPath, path.join(assetsDir, musicFileName));
      musicUrl = `${assets.baseUrl}/${musicFileName}`;
    }

    const props: RabiscoProps = {
      title: generated.title,
      watermark: project.watermark,
      voiceoverUrl: `${assets.baseUrl}/${voiceFileName}`,
      musicUrl,
      musicVolume: config.music.volume,
      scenes,
      captions,
      captionStyle: resolveCaptionStyle(project.captionStyle, config.captions.style as CaptionStyle),
    };

    // 6) Render
    await setProgress(projectId, 75, 'Renderizando');
    log.info(`${projectId}: render Rabisco (${scenes.length} cenas, ${voiceSec.toFixed(1)}s)`);
    await renderRabisco({
      props,
      outputPath,
      onProgress: (ratio) => {
        void setProgress(projectId, 75 + 20 * ratio, 'Renderizando').catch(() => undefined);
      },
    });

    // 7) QA automático (RABISCO.md §4.2 passo 9)
    const stat = await fsp.stat(outputPath);
    const outputInfo = await probe(outputPath);
    const notTruncated = outputInfo.durationSec >= voiceSec - 0.5;
    const qaPassed = stat.size > 0 && outputInfo.durationSec > 1 && outputInfo.hasAudio && notTruncated;

    if (!qaPassed) {
      const reason = !notTruncated
        ? `vídeo (${outputInfo.durationSec.toFixed(1)}s) mais curto que a narração (${voiceSec.toFixed(1)}s) — cortaria o texto no meio`
        : 'arquivo vazio, sem áudio ou duração inconsistente';
      throw new Error(`QA automático falhou: ${reason}.`);
    }

    const outputKey = storageKeys.output(projectId);
    await storage.put(outputKey, await fsp.readFile(outputPath));

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.READY_FOR_REVIEW,
        progress: 100,
        stage: 'Pronto para revisão',
        outputKey,
        outputSizeByte: stat.size,
        renderedAt: new Date(),
        qualityJson: {
          passed: qaPassed,
          durationSec: outputInfo.durationSec,
          hasAudio: outputInfo.hasAudio,
          hasCaptions: captions.length > 0,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    log.info(`${projectId}: READY_FOR_REVIEW (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  } finally {
    await assets.close().catch(() => undefined);
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
