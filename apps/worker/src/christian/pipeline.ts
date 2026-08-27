import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  config,
  getStorage,
  storageKeys,
  type ChristianProps,
  type CaptionSegment,
} from '@editor-video/core';
import { Prisma } from '@prisma/client';
import { getValidAccessToken, prisma, ProjectStatus, uploadVideoResumable } from '@editor-video/db';
import { normalizeClip, probe } from '../ffmpeg.js';
import { logger } from '../logger.js';
import { renderChristian } from '../render.js';
import { serveDirectory } from '../static-server.js';
import { transcriptToCaptions, transcribeWav } from '../whisper.js';
import { downloadFile } from '../v2/download.js';
import { searchBestStock } from '../v2/media-search.js';
import { directScript } from '../voice/director.js';
import { mapVoiceMood } from '../voice/profiles.js';
import { synthesizeDirectedScript } from '../voice/synth.js';
import { pickFallbackCta } from './cta.js';
import { computeCharacterStates, nextEpisodeNumber } from './character.js';
import { generateContent } from './gemini.js';
import { selectPillar } from './planner.js';
import { findPillar } from './pillars.js';
import { checkSafety } from './safety.js';
import { markVerseUsed, selectVerse } from './verses.js';

const log = logger('christian');

async function setProgress(projectId: string, progress: number, stage: string): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: { progress: Math.round(progress), stage },
  });
}

/**
 * Distribui os frames totais entre N cenas de fundo. Arredonda cada cena de
 * forma cumulativa (em vez de cada uma isoladamente) pra nenhum resto de
 * arredondamento se perder — sem isso o vídeo podia terminar 1-2 frames antes
 * do fim real da narração, cortando a última palavra.
 */
function sceneFrameCounts(totalFrames: number, count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [totalFrames];
  const each = totalFrames / count;
  const boundaries = Array.from({ length: count }, (_, i) => Math.round(each * (i + 1)));
  const frames = boundaries.map((b, i) => b - (i === 0 ? 0 : boundaries[i - 1]!));
  return frames.map((f) => Math.max(1, f));
}

export async function runChristianPipeline(projectId: string): Promise<void> {
  const storage = getStorage();

  let project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error(`Projeto ${projectId} não encontrado.`);

  const workDir = path.join(config.tmpDir, `christian-${projectId}`);
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
        progress: 2,
        stage: 'Selecionando pilar do dia',
        errorMessage: null,
      },
    });

    // 1) Content Planner: garante um pilar (docs/Cristão/projeto.md §4)
    if (!project.pillar) {
      const chosen = await selectPillar();
      project = await prisma.project.update({
        where: { id: projectId },
        data: { pillar: chosen.id },
      });
    }
    const pillar = findPillar(project.pillar!);
    if (!pillar) throw new Error(`Pilar desconhecido: "${project.pillar}".`);

    // 2) Biblioteca bíblica (nunca gerada pelo LLM — docs/Cristão/projeto.md §10)
    await setProgress(projectId, 6, 'Selecionando versículo');
    const verse = pillar.needsVerse ? await selectVerse(pillar.category) : null;

    // 3) Gemini — Structured Outputs (docs/Cristão/projeto.md §6)
    log.info(`${projectId}: gerando conteúdo para pilar "${pillar.label}"`);
    await setProgress(projectId, 10, 'Gerando conteúdo com Gemini');
    const content = await generateContent({
      pillar,
      verse: verse ? { reference: `${verse.book} ${verse.chapter}:${verse.verse}`, text: verse.text } : null,
    });

    // 4) Safety checker (docs/Cristão/projeto.md §5/§44)
    const fullText = [content.hook, content.script, content.reflection, content.cta].join(' ');
    const safety = checkSafety(fullText);
    if (!safety.passed) {
      throw new Error(
        `Conteúdo bloqueado pelo safety checker (regras editoriais violadas): ${safety.violations.join('; ')}`,
      );
    }
    const reflection = content.reflection;
    // Resolvido uma única vez: pickFallbackCta() sorteia aleatoriamente, então
    // chamá-la em vários pontos (metadata/narração/legenda) podia produzir CTAs
    // diferentes entre o que é falado e o que aparece na tela.
    const ctaText = content.cta || pickFallbackCta();

    const episode = await nextEpisodeNumber();
    const { start: characterStart, end: characterEnd, arcName } = computeCharacterStates({
      episode,
      pillar,
    });

    const metadata = {
      title: content.youtubeTitle,
      description: content.youtubeHashtags.length
        ? `${content.youtubeDescription}\n\n${content.youtubeHashtags.join(' ')}`
        : content.youtubeDescription,
      // Tags do YouTube (snippet.tags) são palavras-chave internas, sem "#" — hashtags visíveis
      // já foram embutidas na descrição acima.
      tags: (content.youtubeHashtags.length ? content.youtubeHashtags : content.hashtags).map((tag) =>
        tag.replace(/^#/, ''),
      ),
      cta: ctaText,
      pillar: pillar.id,
      pillarLabel: pillar.label,
      arcName,
      episode,
      hook: content.hook,
      reflection,
      verseReference: verse ? `${verse.book} ${verse.chapter}:${verse.verse}` : null,
      verseText: verse?.text ?? null,
    };

    await prisma.project.update({
      where: { id: projectId },
      data: {
        title: content.title.slice(0, 80),
        topic: content.theme,
        scriptJson: content as unknown as Prisma.InputJsonValue,
        safetyJson: safety as unknown as Prisma.InputJsonValue,
        characterStateJson: { start: characterStart, end: characterEnd, arcName, episode } as unknown as Prisma.InputJsonValue,
        seriesId: 'THE_JOURNEY',
        seriesEpisode: episode,
        universe: 'christian',
        verseId: verse?.id ?? null,
        metadataJson: metadata as unknown as Prisma.InputJsonValue,
      },
    });

    if (verse) await markVerseUsed(verse.id);

    // 5) Mídia de fundo (Pexels/Pixabay — mesma busca do Curiosidade)
    await setProgress(projectId, 20, 'Buscando mídia');
    await prisma.mediaAsset.deleteMany({ where: { projectId } });

    // Provedores de stock (Pixabay em especial) rejeitam buscas longas — usamos
    // frases curtas de palavras-chave em vez da sentença cinematográfica inteira.
    const visualKeywords = content.visualPrompt
      .split(/[,.;]/)
      .map((part) => part.trim())
      .filter(Boolean)[0] ?? content.visualPrompt;

    const baseQueries = [
      visualKeywords.slice(0, 90),
      `${content.visualMood} ${pillar.category} nature cinematic`,
      `${content.visualMood} light window cinematic`,
    ].slice(0, Math.max(2, config.christian.visualQueries));

    const usedUrls = new Set<string>();
    const normalizedFiles: string[] = [];

    for (const [index, query] of baseQueries.entries()) {
      const stage = `Mídia ${index + 1}/${baseQueries.length}: ${query}`;
      log.info(`${projectId}: ${stage}`);
      await setProgress(projectId, 20 + (25 * index) / baseQueries.length, stage);

      const hit = await searchBestStock(query, usedUrls);
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
          query,
          position: index,
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
        data: { localKey, durationSec: takeSec, width: config.video.width, height: config.video.height },
      });

      normalizedFiles.push(normalizedPath);
    }

    // 6) Voice Director + TTS (Gemini TTS primário, Piper como fallback —
    // docs/Cristão/projeto.md §17/§18)
    await setProgress(projectId, 50, 'Gerando narração');
    const directed = directScript(
      { script: content.script, reflection, cta: ctaText },
      { pillarId: pillar.id, category: pillar.category, voiceMoodHint: mapVoiceMood(content.voiceMood) },
    );
    log.info(
      `${projectId}: Voice Director — ${directed.segments.length} segmentos, perfil "${directed.profileUsed}"`,
    );
    const { provider: ttsProvider } = await synthesizeDirectedScript(
      directed,
      voiceoverPath,
      path.join(workDir, 'voice-parts'),
    );
    log.info(`${projectId}: narração gerada via ${ttsProvider}`);
    await prisma.project.update({
      where: { id: projectId },
      data: { voiceScriptJson: { ...directed, providerUsed: ttsProvider } as unknown as Prisma.InputJsonValue },
    });
    const voiceInfo = await probe(voiceoverPath);
    const voiceSec = Math.max(voiceInfo.durationSec, config.christian.minDurationSec * 0.6);
    const voiceoverKey = storageKeys.voiceover(projectId);
    await storage.put(voiceoverKey, await fsp.readFile(voiceoverPath));
    await prisma.project.update({ where: { id: projectId }, data: { voiceoverKey } });

    // 7) Legendas (Whisper)
    await setProgress(projectId, 62, 'Gerando legendas');
    let captions: CaptionSegment[] = [];
    try {
      const transcript = await transcribeWav({ wavPath: voiceoverPath, workDir: whisperDir, id: 'voiceover' });
      captions = transcriptToCaptions(transcript, config.video.fps);
    } catch (err) {
      log.error(`${projectId}: Whisper falhou — seguindo sem legendas`, err);
    }

    // 8) Monta cenas — margem de segurança no final pra never cortar a última
    // palavra por arredondamento entre a duração do áudio e a do vídeo.
    const SAFETY_PAD_SEC = 0.6;
    const totalFrames = Math.round((voiceSec + SAFETY_PAD_SEC) * config.video.fps);
    const frameCounts = sceneFrameCounts(totalFrames, normalizedFiles.length);
    const scenes = normalizedFiles.map((filePath, index) => ({
      src: `${assets.baseUrl}/${path.basename(filePath)}`,
      durationInFrames: frameCounts[index]!,
    }));

    const voiceFileName = 'voiceover.wav';
    await fsp.copyFile(voiceoverPath, path.join(assetsDir, voiceFileName));

    const props: ChristianProps = {
      title: content.title,
      watermark: project.watermark,
      pillarLabel: pillar.label,
      hookText: content.hook,
      verse: verse ? { reference: `${verse.book} ${verse.chapter}:${verse.verse}`, text: verse.text } : null,
      reflectionText: reflection,
      ctaText,
      voiceoverUrl: `${assets.baseUrl}/${voiceFileName}`,
      scenes,
      captions,
      characterStart,
      characterEnd,
    };

    // 9) Render
    await setProgress(projectId, 75, 'Renderizando');
    log.info(`${projectId}: render Christian (${scenes.length} cenas, ${voiceSec.toFixed(1)}s, arco "${arcName}")`);
    await renderChristian({
      props,
      outputPath,
      onProgress: (ratio) => {
        void setProgress(projectId, 75 + 20 * ratio, 'Renderizando').catch(() => undefined);
      },
    });

    // 10) QA automático leve (docs/Cristão/projeto.md §26)
    const stat = await fsp.stat(outputPath);
    const outputInfo = await probe(outputPath);
    // O vídeo nunca pode terminar antes do fim da narração — tolerância pequena
    // só pra absorver arredondamento de encoding, não corte real de conteúdo.
    const notTruncated = outputInfo.durationSec >= voiceSec - 0.5;
    const qaPassed =
      stat.size > 0 &&
      outputInfo.durationSec > 1 &&
      outputInfo.hasAudio &&
      notTruncated &&
      safety.passed;

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
          safetyPassed: safety.passed,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    log.info(`${projectId}: READY_FOR_REVIEW (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);

    // 11) Agendamento automático (geração em lote — docs/Cristão/projeto.md §24).
    // Só roda quando o projeto foi criado com scheduledAt; o fluxo manual (botão
    // "Publicar" no editor) continua exigindo clique explícito do usuário.
    if (project.scheduledAt && project.userId) {
      try {
        await setProgress(projectId, 100, 'Agendando publicação no YouTube');
        const accessToken = await getValidAccessToken(project.userId);
        const file = await fsp.readFile(outputPath);
        const videoId = await uploadVideoResumable({
          accessToken,
          file,
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          publishAt: project.scheduledAt.toISOString(),
        });
        await prisma.project.update({
          where: { id: projectId },
          data: {
            status: ProjectStatus.PUBLISHED,
            publishedAt: new Date(),
            youtubeVideoId: videoId,
            stage: `Agendado para ${project.scheduledAt.toLocaleString('pt-BR')}`,
          },
        });
        log.info(`${projectId}: agendado no YouTube (${videoId}) para ${project.scheduledAt.toISOString()}`);
      } catch (err) {
        log.error(`${projectId}: falha ao agendar publicação automática — deixando para publicação manual`, err);
      }
    }
  } finally {
    await assets.close().catch(() => undefined);
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
