import type { NextRequest } from 'next/server';
import { findPillar } from '@editor-video/core/christian';
import { config } from '@editor-video/core/server';
import { prisma, ProjectKind } from '@editor-video/db';
import { requireUser } from '@/lib/auth-guards';
import { ApiError, handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { clips: true } } },
    });
    return json({ projects });
  });
}

interface CreateBody {
  title?: unknown;
  watermark?: unknown;
  kind?: unknown;
  topic?: unknown;
  pillar?: unknown;
  rabiscoThought?: unknown;
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const body = (await request.json()) as CreateBody;
    const watermarkRaw = typeof body.watermark === 'string' ? body.watermark.trim() : '';
    const watermark = watermarkRaw === '' ? null : watermarkRaw;

    const kindRaw = typeof body.kind === 'string' ? body.kind : 'TOP_LIST';
    if (kindRaw !== 'TOP_LIST' && kindRaw !== 'CURIOSIDADE' && kindRaw !== 'CHRISTIAN' && kindRaw !== 'RABISCO') {
      throw new ApiError('Tipo de projeto inválido.');
    }

    if (kindRaw === 'RABISCO') {
      const rabiscoThought = typeof body.rabiscoThought === 'string' ? body.rabiscoThought.trim() : '';
      if (rabiscoThought.length < 10) {
        throw new ApiError('Escreva um pouco mais sobre o que você está pensando (mínimo 10 caracteres).');
      }

      const project = await prisma.project.create({
        data: {
          kind: ProjectKind.RABISCO,
          title: '(gerando...)',
          rabiscoThought,
          durationPreset: 'SHORT',
          watermark,
          userId: user.id,
        },
      });
      return json({ project }, 201);
    }

    if (kindRaw === 'CHRISTIAN') {
      const pillarRaw = typeof body.pillar === 'string' ? body.pillar.trim() : '';
      const pillar = pillarRaw === '' ? null : pillarRaw;
      if (pillar && !findPillar(pillar)) {
        throw new ApiError('Pilar de conteúdo inválido.');
      }

      const project = await prisma.project.create({
        data: {
          kind: ProjectKind.CHRISTIAN,
          title: pillar ? (findPillar(pillar)?.label ?? 'Canal Cristão') : 'Canal Cristão (a definir)',
          pillar,
          watermark: watermark ?? (config.christian.youtubeHandle || null),
          userId: user.id,
        },
      });
      return json({ project }, 201);
    }

    if (kindRaw === 'CURIOSIDADE') {
      const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
      if (topic.length < 3) {
        throw new ApiError('O tema precisa ter pelo menos 3 caracteres.');
      }
      const title =
        typeof body.title === 'string' && body.title.trim().length >= 3
          ? body.title.trim()
          : topic.slice(0, 80);

      const project = await prisma.project.create({
        data: {
          kind: ProjectKind.CURIOSIDADE,
          title,
          topic,
          watermark,
          userId: user.id,
        },
      });
      return json({ project }, 201);
    }

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (title.length < 3) {
      throw new ApiError('O título precisa ter pelo menos 3 caracteres.');
    }

    const project = await prisma.project.create({
      data: {
        kind: ProjectKind.TOP_LIST,
        title,
        watermark,
        userId: user.id,
      },
    });

    return json({ project }, 201);
  });
}
