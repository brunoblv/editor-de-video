import type { NextRequest } from 'next/server';
import { config, getStorage } from '@editor-video/core';
import { prisma } from '@editor-video/db';
import { ApiError, handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

interface PatchBody {
  label?: unknown;
  maxDurationSec?: unknown;
  transcribe?: unknown;
}

export async function PATCH(request: NextRequest, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    const body = (await request.json()) as PatchBody;
    const data: { label?: string | null; maxDurationSec?: number; transcribe?: boolean } = {};

    if (typeof body.label === 'string') {
      const label = body.label.trim();
      if (label.length > 140) throw new ApiError('O texto do clipe deve ter até 140 caracteres.');
      data.label = label === '' ? null : label;
    }

    if (body.maxDurationSec !== undefined) {
      const value = Number(body.maxDurationSec);
      if (!Number.isFinite(value) || value < 1 || value > config.limits.maxClipDurationSec) {
        throw new ApiError(
          `A duração máxima deve estar entre 1 e ${config.limits.maxClipDurationSec} segundos.`,
        );
      }
      data.maxDurationSec = value;
    }

    if (body.transcribe !== undefined) {
      if (typeof body.transcribe !== 'boolean') {
        throw new ApiError('O campo transcribe deve ser booleano.');
      }
      data.transcribe = body.transcribe;
    }

    const clip = await prisma.clip.update({ where: { id }, data });
    return json({ clip });
  });
}

export async function DELETE(_request: NextRequest, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    const clip = await prisma.clip.findUnique({ where: { id } });
    if (!clip) throw new ApiError('Clipe não encontrado.', 404);

    const storage = getStorage();
    await prisma.clip.delete({ where: { id } });
    await storage.delete(clip.sourceKey);
    if (clip.normalizedKey) await storage.delete(clip.normalizedKey);

    // Reindexa as posições para manter a sequência 0..n-1 sem buracos.
    const remaining = await prisma.clip.findMany({
      where: { projectId: clip.projectId },
      orderBy: { position: 'asc' },
    });
    await prisma.$transaction(
      remaining.map((item, index) =>
        prisma.clip.update({
          where: { id: item.id },
          // Deslocamento temporário evita colidir com o índice único (projectId, position).
          data: { position: -1 - index },
        }),
      ),
    );
    await prisma.$transaction(
      remaining.map((item, index) =>
        prisma.clip.update({ where: { id: item.id }, data: { position: index } }),
      ),
    );

    return json({ ok: true });
  });
}
