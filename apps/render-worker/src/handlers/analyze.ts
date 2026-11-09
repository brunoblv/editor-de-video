/**
 * Análise de asset (§11 passos 3–5): inspeção, proxy e — quando pedido —
 * transcrição. Cada etapa é cacheada pela chave (hash + parâmetros +
 * modelo + versão do pipeline): alterar título nunca retranscreve (AC-09).
 */
import path from 'node:path';
import { getStorage } from '@editor-video/core/server';
import { prisma } from '@editor-video/db';
import { attachMusicalMap, findLyricsProject, lyricsSegment, lyricsTranscriptCacheKey, musicMapKey, readMusicalMap, runStep, saveLyricsTranscript, writeMusicalMap } from '@editor-video/db/v3';
import { musicalMapSchema, stepCacheKey, type TranscribedSegment } from '@editor-video/domain';
import { analyzeMusic, inspectMedia, lyricsTranscriptionProvider, makeProxy, MUSIC_ANALYSIS_VERSION, runProcess, toolPaths, transcriptionProviderFromEnv } from '@editor-video/integrations';
import { parseTimeline } from '@editor-video/timeline';
import type { Prisma, RenderJob } from '@prisma/client';
import type { JobContext } from '../context.js';

const json = (v: unknown) => v as Prisma.InputJsonValue;

export async function handleAnalyze(job: RenderJob, ctx: JobContext): Promise<void> {
  if (!job.assetId) throw new Error('Job de análise sem assetId');
  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: job.assetId } });
  if (!asset.sha256) throw new Error('Asset sem hash');
  const storage = getStorage();
  const original = await storage.toLocalPath(asset.storageKey);
  await prisma.asset.update({ where: { id: asset.id }, data: { status: 'ANALYZING' } });

  await ctx.progress(0.05, 'Inspecionando mídia');
  const inspect = await runStep(job.id, 'inspect', stepCacheKey({ step: 'inspect', assetHash: asset.sha256 }), async () => {
    const info = await inspectMedia(original);
    return { output: { ...info, sizeBytes: info.sizeBytes.toString() } };
  });

  if (asset.kind === 'VIDEO') {
    await ctx.progress(0.2, 'Gerando proxy');
    const params = { height: 540 };
    const proxy = await runStep(job.id, 'proxy', stepCacheKey({ step: 'proxy', assetHash: asset.sha256, params }), async () => {
      const key = `proxies/${asset.sha256}-540.mp4`;
      const tmp = path.join(ctx.workDir, 'proxy.mp4');
      await makeProxy(original, tmp, { ...params, signal: ctx.signal });
      const { createReadStream } = await import('node:fs');
      await storage.put(key, createReadStream(tmp));
      return { output: { key }, artifactKey: key };
    });
    await prisma.asset.update({ where: { id: asset.id }, data: { proxyKey: proxy.artifactKey } });
  }

  const params = (job.paramsJson ?? {}) as { transcribe?: boolean; language?: string; music?: boolean; lyrics?: boolean };
  if (params.lyrics && asset.kind === 'AUDIO') {
    // Letra do Reactive Lyrics: Whisper só no trecho usado, tempos devolvidos em segundos da música.
    const lyrics = await findLyricsProject(job.projectId);
    if (!lyrics) throw new Error('Projeto não é Reactive Lyrics');
    const project = await prisma.videoProject.findUniqueOrThrow({ where: { id: job.projectId }, include: { currentRevision: true } });
    const segment = lyricsSegment(parseTimeline(project.currentRevision!.documentJson), asset.id);
    const provider = lyricsTranscriptionProvider();
    const language = lyrics.language ? lyrics.language.split('-')[0]!.toLowerCase() : null;
    const cacheKey = lyricsTranscriptCacheKey(asset.sha256, { startMs: segment.startMs, durationMs: segment.durationMs }, language, `${provider.name}:${provider.model}`);
    await ctx.progress(0.2, `Transcrevendo a letra (${provider.name} ${provider.model})`);
    const result = await runStep(job.id, 'lyrics-transcribe', cacheKey, async () => {
      const clip = path.join(ctx.workDir, 'trecho.wav');
      await runProcess(toolPaths().ffmpeg, ['-y', '-v', 'error', '-ss', (segment.startMs / 1000).toFixed(3), '-t', (segment.durationMs / 1000).toFixed(3), '-i', original, '-vn', '-ac', '1', '-ar', '16000', clip], { signal: ctx.signal });
      const t = await provider.transcribe(clip, { language: language ?? undefined, signal: ctx.signal, music: true });
      const shift = (s: number) => Math.round((s + segment.startMs / 1000) * 1000) / 1000;
      const segments: TranscribedSegment[] = t.segments.map((seg) => ({
        text: seg.text,
        startSec: shift(seg.startSec),
        endSec: shift(seg.endSec),
        words: seg.words.map((w) => ({ text: w.text, startSec: shift(w.startSec), endSec: shift(w.endSec), ...(w.confidence !== undefined ? { confidence: w.confidence } : {}) })),
      }));
      return { output: { language: t.language, provider: t.provider, model: t.model, segments } };
    });
    await ctx.progress(0.9, 'Importando a letra transcrita');
    await saveLyricsTranscript({ projectId: job.projectId, requestedById: job.requestedById, audioAssetId: asset.id, cacheKey, transcript: result.output as { language: string; provider: string; model: string; segments: TranscribedSegment[] } });
  }
  if (params.music && asset.kind === 'AUDIO') {
    // Mapa musical (Reactive Lyrics): JSON no storage, cacheado por hash + versão do algoritmo.
    await ctx.progress(0.3, 'Analisando a música');
    const step = await runStep(job.id, 'music', stepCacheKey({ step: 'music', assetHash: asset.sha256, params: { version: MUSIC_ANALYSIS_VERSION } }), async () => {
      const map = musicalMapSchema.parse(
        await analyzeMusic(original, { audioHash: asset.sha256!, audioAssetId: asset.id, workDir: path.join(ctx.workDir, 'music'), signal: ctx.signal }),
      );
      const key = await writeMusicalMap(map);
      return { output: { bpmEstimate: map.bpmEstimate, beats: map.beatTimesMs.length, onsets: map.onsets.length, analysisVersion: map.analysisVersion }, artifactKey: key };
    });
    const key = step.artifactKey ?? musicMapKey(asset.sha256);
    const map = await readMusicalMap(key);
    await attachMusicalMap(asset.id, key, map);
  }

  if (params.transcribe && (asset.kind === 'VIDEO' || asset.kind === 'AUDIO') && asset.hasAudio) {
    const provider = transcriptionProviderFromEnv();
    const tparams = { language: params.language ?? 'auto' };
    const cacheKey = stepCacheKey({ step: 'transcribe', assetHash: asset.sha256, params: tparams, model: `${provider.name}:${provider.model}` });
    await ctx.progress(0.5, `Transcrevendo (${provider.name})`);
    const result = await runStep(job.id, 'transcribe', cacheKey, async () => {
      const transcript = await provider.transcribe(original, { language: params.language, signal: ctx.signal });
      return { output: transcript };
    });
    const existing = await prisma.transcriptVersion.findFirst({ where: { assetId: asset.id, cacheKey } });
    if (!existing) {
      const last = await prisma.transcriptVersion.findFirst({ where: { assetId: asset.id }, orderBy: { version: 'desc' } });
      const t = result.output as { language: string; provider: string; model: string; segments: unknown[] };
      await prisma.transcriptVersion.create({
        data: { assetId: asset.id, version: (last?.version ?? 0) + 1, language: t.language, provider: t.provider, model: t.model, cacheKey, segmentsJson: json(t.segments) },
      });
    }
  }

  await prisma.asset.update({ where: { id: asset.id }, data: { status: 'READY', mediaInfoJson: json(inspect.output) } });
}
