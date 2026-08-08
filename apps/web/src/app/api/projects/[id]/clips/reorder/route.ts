import type { NextRequest } from 'next/server';
import { prisma } from '@editor-video/db';
import { requireProjectAccess } from '@/lib/auth-guards';
import { ApiError, handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

interface ReorderBody {
  order?: unknown;
}

export async function POST(request: NextRequest, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { id: projectId } = await params;
    await requireProjectAccess(projectId);
    const body = (await request.json()) as ReorderBody;

    const order = Array.isArray(body.order)
      ? body.order.filter((value): value is string => typeof value === 'string')
      : [];

    const clips = await prisma.clip.findMany({ where: { projectId }, select: { id: true } });
    const known = new Set(clips.map((clip) => clip.id));

    if (order.length !== known.size || !order.every((id) => known.has(id))) {
      throw new ApiError('A nova ordem precisa conter exatamente os clipes do projeto.');
    }

    // Duas passadas: posições negativas primeiro para não violar o índice único.
    await prisma.$transaction(
      order.map((id, index) =>
        prisma.clip.update({ where: { id }, data: { position: -1 - index } }),
      ),
    );
    await prisma.$transaction(
      order.map((id, index) => prisma.clip.update({ where: { id }, data: { position: index } })),
    );

    const updated = await prisma.clip.findMany({
      where: { projectId },
      orderBy: { position: 'asc' },
    });
    return json({ clips: updated });
  });
}
