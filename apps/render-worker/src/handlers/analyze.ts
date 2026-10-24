/**
 * Análise de asset (§11 passos 3–5): inspeção, proxy e — quando pedido —
 * transcrição. Cada etapa é cacheada pela chave (hash + parâmetros +
 * modelo + versão do pipeline): alterar título nunca retranscreve (AC-09).
 */
import path from 'node:path';
import { getStorage } from '@editor-video/core/server';
import { prisma } from '@editor-video/db';
import { runStep } from '@editor-video/db/v3';
import { stepCacheKey } from '@editor-video/domain';
import { inspectMedia, makeProxy, transcriptionProviderFromEnv } from '@editor-video/integrations';
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

  const params = (job.paramsJson ?? {}) as { transcribe?: boolean; language?: string };
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
