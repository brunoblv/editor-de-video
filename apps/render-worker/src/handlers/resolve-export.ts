/** Pacote Resolve (RF-19): exporta para o storage como entrega RESOLVE_PACKAGE. */
import path from 'node:path';
import fsp from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { getStorage } from '@editor-video/core/server';
import { prisma } from '@editor-video/db';
import { resolveAssetPath } from '@editor-video/db/v3';
import { exportResolvePackage } from '@editor-video/integrations';
import { parseTimeline } from '@editor-video/timeline';
import type { Prisma, RenderJob } from '@prisma/client';
import type { JobContext } from '../context.js';

const json = (v: unknown) => v as Prisma.InputJsonValue;

export async function handleResolveExport(job: RenderJob, ctx: JobContext): Promise<void> {
  if (!job.revisionId || !job.deliverableId) throw new Error('Export Resolve sem revisão/entrega');
  const revision = await prisma.timelineRevision.findUniqueOrThrow({ where: { id: job.revisionId } });
  const doc = parseTimeline(revision.documentJson);
  const storage = getStorage();
  const reference = await prisma.deliverable.findFirst({
    where: { revisionId: revision.id, kind: 'FINAL', state: 'READY', variantId: job.variantId ?? null },
    orderBy: { createdAt: 'desc' },
  });
  await ctx.progress(0.1, 'Copiando mídias');
  const outDir = path.join(ctx.workDir, 'resolve');
  const manifest = await exportResolvePackage({
    doc,
    outDir,
    resolveOriginal: (assetId) => resolveAssetPath(assetId, false),
    referenceVideoPath: reference?.storageKey ? await storage.toLocalPath(reference.storageKey) : null,
  });
  await ctx.progress(0.8, 'Gravando pacote');
  const prefix = `deliverables/${doc.projectId}/resolve-${job.deliverableId}`;
  for (const entry of await fsp.readdir(outDir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const abs = path.join(entry.parentPath, entry.name);
    const rel = path.relative(outDir, abs).replace(/\\/g, '/');
    await storage.put(`${prefix}/${rel}`, createReadStream(abs));
  }
  await prisma.deliverable.update({
    where: { id: job.deliverableId },
    data: { state: 'READY', storageKey: `${prefix}/manifest.json`, validationJson: json({ limitations: manifest.limitations, media: manifest.media.length }) },
  });
}
