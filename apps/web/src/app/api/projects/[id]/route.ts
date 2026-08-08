import type { NextRequest } from 'next/server';
import { getStorage, storageKeys } from '@editor-video/core';
import { prisma } from '@editor-video/db';
import { requireProjectAccess } from '@/lib/auth-guards';
import { toProjectDTO } from '@/lib/dto';
import { ApiError, handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    await requireProjectAccess(id);
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        clips: { orderBy: { position: 'asc' } },
        mediaAssets: { orderBy: { position: 'asc' } },
      },
    });
    if (!project) throw new ApiError('Projeto não encontrado.', 404);
    return json({ project: toProjectDTO(project) });
  });
}

interface PatchBody {
  title?: unknown;
  watermark?: unknown;
  topic?: unknown;
}

export async function PATCH(request: NextRequest, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    await requireProjectAccess(id);
    const body = (await request.json()) as PatchBody;
    const data: { title?: string; watermark?: string | null; topic?: string | null } = {};

    if (typeof body.title === 'string') {
      const title = body.title.trim();
      if (title.length < 3) throw new ApiError('O título precisa ter pelo menos 3 caracteres.');
      data.title = title;
    }
    if (typeof body.watermark === 'string') {
      const watermark = body.watermark.trim();
      data.watermark = watermark === '' ? null : watermark;
    }
    if (typeof body.topic === 'string') {
      const topic = body.topic.trim();
      if (topic.length < 3) throw new ApiError('O tema precisa ter pelo menos 3 caracteres.');
      data.topic = topic;
      if (!data.title) data.title = topic.slice(0, 80);
    }

    const project = await prisma.project.update({
      where: { id },
      data,
      include: {
        clips: { orderBy: { position: 'asc' } },
        mediaAssets: { orderBy: { position: 'asc' } },
      },
    });
    return json({ project: toProjectDTO(project) });
  });
}

export async function DELETE(_request: NextRequest, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    await requireProjectAccess(id);
    await prisma.project.delete({ where: { id } });
    await getStorage().deletePrefix(storageKeys.project(id));
    return json({ ok: true });
  });
}
