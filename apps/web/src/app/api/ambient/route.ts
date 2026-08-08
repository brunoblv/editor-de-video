import type { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma, ProjectKind, ProjectStatus } from '@editor-video/db';
import { renderQueue } from '@/lib/queue';
import { ApiError, handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

interface CreateAmbientBody {
  title?: unknown;
  environment?: unknown;
  weather?: unknown;
  timeOfDay?: unknown;
  purpose?: unknown;
  durationMinutes?: unknown;
  preset?: unknown;
  format?: unknown;
  audioLayers?: unknown;
  visualQueries?: unknown;
  autoConcept?: unknown;
  autoSearch?: unknown;
  generateThumbnail?: unknown;
  generateMetadata?: unknown;
  qualityCheck?: unknown;
  createVariations?: unknown;
  startPreview?: unknown;
  seed?: unknown;
}

export async function GET(): Promise<Response> {
  return handle(async () => {
    const projects = await prisma.project.findMany({
      where: { kind: ProjectKind.AMBIENT },
      orderBy: { createdAt: 'desc' },
    });
    return json({ projects });
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(async () => {
    const body = (await request.json()) as CreateAmbientBody;

    const autoConcept = Boolean(body.autoConcept);
    const environment =
      typeof body.environment === 'string' && body.environment.trim()
        ? body.environment.trim()
        : autoConcept
          ? null
          : 'cabin';
    const weather =
      typeof body.weather === 'string' && body.weather.trim()
        ? body.weather.trim()
        : autoConcept
          ? null
          : 'rain';
    const timeOfDay =
      typeof body.timeOfDay === 'string' && body.timeOfDay.trim()
        ? body.timeOfDay.trim()
        : autoConcept
          ? null
          : 'night';
    const purpose = typeof body.purpose === 'string' ? body.purpose.trim() : 'sleep';
    const durationMinutes =
      typeof body.durationMinutes === 'number' && body.durationMinutes > 0
        ? Math.round(body.durationMinutes)
        : 60;
    // Não forçar RAIN_SLEEP: o worker resolve o preset a partir do ambiente.
    const preset =
      typeof body.preset === 'string' && body.preset.trim()
        ? body.preset.trim()
        : null;
    const format = body.format === 'shorts' ? 'shorts' : 'youtube';
    const audioLayers = Array.isArray(body.audioLayers)
      ? body.audioLayers.filter((x): x is string => typeof x === 'string')
      : [];
    const visualQueries = Array.isArray(body.visualQueries)
      ? body.visualQueries.filter((x): x is string => typeof x === 'string')
      : [];
    const seed =
      typeof body.seed === 'number' && Number.isFinite(body.seed)
        ? Math.floor(body.seed)
        : Math.floor(Math.random() * 1_000_000);

    if (!autoConcept && audioLayers.length === 0) {
      throw new ApiError('Selecione ao menos uma camada sonora.');
    }

    const title =
      typeof body.title === 'string' && body.title.trim().length >= 3
        ? body.title.trim()
        : `${(weather ?? 'rain').replace(/_/g, ' ')} ${environment ?? 'cabin'} · ${timeOfDay ?? 'night'}`.slice(
            0,
            80,
          );

    const ambientConfig = {
      autoConcept,
      autoSearch: body.autoSearch !== false,
      generateThumbnail: body.generateThumbnail !== false,
      generateMetadata: body.generateMetadata !== false,
      qualityCheck: body.qualityCheck !== false,
      createVariations: Boolean(body.createVariations),
      format,
      audioLayers,
      visualQueries,
    };

    const project = await prisma.project.create({
      data: {
        kind: ProjectKind.AMBIENT,
        title,
        environment: environment ?? undefined,
        weather: weather ?? undefined,
        timeOfDay: timeOfDay ?? undefined,
        purpose,
        durationMinutes,
        preset: preset ?? undefined,
        seed,
        ambientConfigJson: ambientConfig as unknown as Prisma.InputJsonValue,
        status: ProjectStatus.DRAFT,
      },
    });

    if (body.startPreview !== false) {
      await prisma.project.update({
        where: { id: project.id },
        data: {
          status: ProjectStatus.QUEUED,
          progress: 0,
          stage: 'Na fila',
          errorMessage: null,
        },
      });
      await renderQueue.add(
        'render-project',
        { projectId: project.id, ambientMode: 'preview' },
        { jobId: `project:${project.id}:${Date.now()}` },
      );
    }

    const fresh = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    return json({ project: fresh }, 201);
  });
}
