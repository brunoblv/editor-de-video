import path from 'node:path';
import type { NextRequest } from 'next/server';
import { getStorage, storageKeys } from '@editor-video/core';
import { LicenseVerdict, prisma } from '@editor-video/db';
import { requireUser } from '@/lib/auth-guards';
import { evaluateLicense } from '@/lib/license-guard';
import { renderQueue } from '@/lib/queue';
import { ApiError, handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const ALLOWED_EXT = new Set(['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac']);

export async function GET(request: NextRequest): Promise<Response> {
  return handle(async () => {
    await requireUser();
    const category = request.nextUrl.searchParams.get('category');
    const assets = await prisma.soundAsset.findMany({
      where: category && category !== 'all' ? { category } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    return json({ assets });
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(async () => {
    await requireUser();
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new ApiError('Arquivo de áudio obrigatório.');

    const name = String(form.get('name') ?? '').trim();
    const category = String(form.get('category') ?? '').trim();
    const provider = String(form.get('provider') ?? 'local').trim() || 'local';
    const license = String(form.get('license') ?? '').trim();
    const attribution = String(form.get('attribution') ?? '').trim() || null;
    const sourceUrl = String(form.get('sourceUrl') ?? '').trim() || null;

    if (name.length < 2) throw new ApiError('Nome inválido.');
    if (!category) throw new ApiError('Categoria obrigatória.');

    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      throw new ApiError(`Formato não suportado. Use: ${[...ALLOWED_EXT].join(', ')}`);
    }

    const decision = evaluateLicense({ provider, license });
    if (
      decision.verdict === LicenseVerdict.UNKNOWN ||
      decision.verdict === LicenseVerdict.REJECTED
    ) {
      throw new ApiError(`License Guard: ${decision.reason}`);
    }

    const asset = await prisma.soundAsset.create({
      data: {
        name,
        category,
        provider,
        sourceUrl,
        localKey: 'pending',
        durationSec: 0,
        license: license || null,
        attribution,
        commercialUse: decision.commercialUse,
        modificationAllowed: decision.modificationAllowed,
        attributionRequired: decision.attributionRequired,
        verified: decision.verified,
        licenseVerdict: decision.verdict,
        qualityScore: 70,
        loopScore: 70,
        tags: [],
      },
    });

    const localKey = storageKeys.soundAsset(asset.id, ext);
    await getStorage().put(localKey, Buffer.from(await file.arrayBuffer()));

    const updated = await prisma.soundAsset.update({
      where: { id: asset.id },
      data: { localKey },
    });

    // Enfileira análise completa (probe/loudnorm/scores) no worker.
    await renderQueue.add(
      'analyze-sound',
      { projectId: 'sound-analyze', analyzeSoundAssetId: asset.id },
      { jobId: `analyze-sound-${asset.id}-${Date.now()}`, attempts: 2 },
    );

    return json({ asset: updated }, 201);
  });
}
