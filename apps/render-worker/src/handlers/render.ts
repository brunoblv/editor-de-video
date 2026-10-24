/**
 * Render de prévia/final de uma revisão (RF-12, §8, §11 passos 6–8):
 * compila o documento → renderiza composições Hyperframes (cacheadas) →
 * FFmpeg → validação técnica → hash → publicação atômica no storage.
 * Uma falha não apaga revisão nem entregas válidas anteriores.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { getStorage } from '@editor-video/core/server';
import { prisma } from '@editor-video/db';
import { resolveAssetPath, runStep } from '@editor-video/db/v3';
import { hashObject, stepCacheKey } from '@editor-video/domain';
import { hashFile, renderComposition, renderPlanWithFfmpeg, toolVersions, validateOutput } from '@editor-video/integrations';
import { parseTimeline } from '@editor-video/timeline';
import { compileTimeline } from '@editor-video/timeline/compile';
import type { Prisma, RenderJob } from '@prisma/client';
import type { JobContext } from '../context.js';

const json = (v: unknown) => v as Prisma.InputJsonValue;
const FILE_PARAM = '$file:';

export async function handleRender(job: RenderJob, ctx: JobContext): Promise<Record<string, unknown>> {
  if (!job.revisionId || !job.deliverableId) throw new Error('Job de render sem revisão/entrega');
  const quality = job.kind === 'RENDER_PREVIEW' ? 'preview' : 'final';
  const revision = await prisma.timelineRevision.findUniqueOrThrow({ where: { id: job.revisionId } });
  const doc = parseTimeline(revision.documentJson);
  const plan = compileTimeline(doc, { variantId: job.variantId, quality });
  const storage = getStorage();

  await prisma.deliverable.update({ where: { id: job.deliverableId }, data: { state: 'RENDERING', planHash: plan.planHash, width: plan.width, height: plan.height, durationSec: plan.durationSec } });

  // 1. Composições (Hyperframes), cada uma cacheada por template+params+tamanho+duração.
  const compositionFiles = new Map<string, string>();
  const compositions = plan.video.filter((l) => l.kind === 'composition');
  for (const [i, layer] of compositions.entries()) {
    await ctx.progress(0.05 + (0.25 * i) / Math.max(1, compositions.length), `Composição ${i + 1}/${compositions.length}`);
    const raw = layer.params ?? {};
    const variables = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith(FILE_PARAM)));
    const fileRefs = Object.fromEntries(Object.entries(raw).filter(([k]) => k.startsWith(FILE_PARAM)).map(([k, v]) => [k.slice(FILE_PARAM.length), String(v)]));
    const durationSec = layer.endSec - layer.startSec;
    const spec = { template: layer.templateId, version: layer.templateVersion, variables, fileRefs, width: plan.width, height: plan.height, durationSec, quality };
    const step = await runStep(job.id, `composition:${layer.itemId}`, stepCacheKey({ step: 'render', planHash: hashObject(spec), params: { kind: 'composition' } }), async () => {
      const files: Record<string, string> = {};
      for (const [rel, assetId] of Object.entries(fileRefs)) files[rel] = (await resolveAssetPath(assetId, false)).path;
      const out = path.join(ctx.workDir, `comp-${layer.itemId}.mp4`);
      const result = await renderComposition({
        templateSlug: layer.templateId!,
        templateVersion: layer.templateVersion!,
        params: variables,
        width: plan.width,
        height: plan.height,
        durationSec,
        quality,
        workDir: path.join(ctx.workDir, `hf-${layer.itemId}`),
        outputPath: out,
        files,
        signal: ctx.signal,
      });
      const key = `cache/compositions/${hashObject(spec)}.mp4`;
      await storage.put(key, createReadStream(result.outputPath));
      return { output: { hyperframesVersion: result.hyperframesVersion }, artifactKey: key };
    });
    compositionFiles.set(layer.itemId, await storage.toLocalPath(step.artifactKey!));
  }

  // 2. Montagem FFmpeg (mesmo compilador para prévia e final).
  await ctx.progress(0.3, 'Renderizando');
  const outLocal = path.join(ctx.workDir, 'output.mp4');
  const { ffmpegArgs } = await renderPlanWithFfmpeg({
    plan,
    outputPath: outLocal,
    workDir: path.join(ctx.workDir, 'ffmpeg'),
    resolveAsset: async (assetId, useProxy) => {
      try {
        return await resolveAssetPath(assetId, useProxy);
      } catch (err) {
        // Sem proxy pronto, a prévia usa o original; o final SEMPRE usa o original.
        if (useProxy) return resolveAssetPath(assetId, false);
        throw err;
      }
    },
    resolveComposition: async (itemId) => compositionFiles.get(itemId)!,
    signal: ctx.signal,
    onProgress: (p) => void ctx.progress(0.3 + p * 0.55, 'Renderizando'),
  });

  // 3. Validação técnica.
  await prisma.deliverable.update({ where: { id: job.deliverableId }, data: { state: 'VALIDATING' } });
  await ctx.progress(0.88, 'Validando');
  const report = await validateOutput(outLocal, {
    durationSec: plan.durationSec,
    width: plan.width,
    height: plan.height,
    fpsNum: plan.fps.num,
    fpsDen: plan.fps.den,
    expectAudio: true,
    fullDecode: quality === 'final' && plan.durationSec <= 15 * 60,
    measureLoudness: quality === 'final',
    skipBlackSilence: plan.durationSec > 15 * 60,
  });
  if (!report.ok) {
    await prisma.deliverable.update({ where: { id: job.deliverableId }, data: { state: 'FAILED', validationJson: json(report) } });
    throw Object.assign(new Error(`Validação reprovou: ${report.checks.filter((c) => c.status === 'fail').map((c) => c.message).join('; ')}`), { category: 'INVALID' });
  }

  // 4. Hash e publicação atômica no storage (key final só após sucesso).
  await ctx.progress(0.95, 'Salvando entrega');
  const sha256 = await hashFile(outLocal);
  const stat = await fsp.stat(outLocal);
  const key = `deliverables/${doc.projectId}/${job.deliverableId}.mp4`;
  await storage.put(key, createReadStream(outLocal));
  await prisma.deliverable.update({
    where: { id: job.deliverableId },
    data: {
      state: 'READY',
      storageKey: key,
      sha256,
      sizeBytes: BigInt(stat.size),
      validationJson: json({ ...report, media: report.media ? { ...report.media, sizeBytes: report.media.sizeBytes.toString() } : null }),
    },
  });
  return { environment: { ...(await toolVersions()), planHash: plan.planHash, ffmpegArgsCount: ffmpegArgs.length } };
}
