import type { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@editor-video/db';
import { requireProjectAccess } from '@/lib/auth-guards';
import { toProjectDTO } from '@/lib/dto';
import { ApiError, handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    await requireProjectAccess(id);
    const body = (await request.json()) as {
      title?: unknown;
      description?: unknown;
      tags?: unknown;
    };

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) throw new ApiError('Projeto não encontrado.', 404);

    const prev =
      project.metadataJson && typeof project.metadataJson === 'object'
        ? (project.metadataJson as Record<string, unknown>)
        : {};

    const next = { ...prev };
    if (typeof body.title === 'string' && body.title.trim()) {
      next.title = body.title.trim().slice(0, 100);
    }
    if (typeof body.description === 'string') {
      next.description = body.description.slice(0, 5000);
    }
    if (Array.isArray(body.tags)) {
      next.tags = body.tags
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 40);
    }

    const updated = await prisma.project.update({
      where: { id },
      data: {
        metadataJson: next as unknown as Prisma.InputJsonValue,
        ...(typeof next.title === 'string' ? { title: String(next.title).slice(0, 80) } : {}),
      },
      include: {
        clips: { orderBy: { position: 'asc' } },
        mediaAssets: { orderBy: { position: 'asc' } },
      },
    });

    return json({ project: toProjectDTO(updated) });
  });
}
