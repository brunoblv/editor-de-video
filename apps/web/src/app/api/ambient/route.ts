import type { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import {
  buildMidnightTitle,
  config,
  getMidnightRecipe,
  getMidnightVariation,
  MIDNIGHT_RECIPE_VERSION,
  MIDNIGHT_PIPELINE_VERSION,
} from '@editor-video/core';
import { prisma, ProjectKind, ProjectStatus } from '@editor-video/db';
import { requireUser } from '@/lib/auth-guards';
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
  recipeId?: unknown;
  preset?: unknown;
  variationId?: unknown;
  format?: unknown;
  audioLayers?: unknown;
  visualQueries?: unknown;
  autoConcept?: unknown;
  autoSearch?: unknown;
  generateThumbnail?: unknown;
  generateMetadata?: unknown;
  qualityCheck?: unknown;
  /** true = gera 1 projeto por combinação variation × duration */
  createBatch?: unknown;
  variations?: unknown;
  durations?: unknown;
  startPreview?: unknown;
  seed?: unknown;
}

type BatchItem = {
  variationId: string;
  durationMinutes: number;
};

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

function parseNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0)
    .map((x) => Math.round(x));
}

async function enqueuePreview(projectId: string): Promise<void> {
  const queued = await prisma.project.updateMany({
    where: {
      id: projectId,
      status: {
        in: [
          ProjectStatus.DRAFT,
          ProjectStatus.FAILED,
          ProjectStatus.READY,
          ProjectStatus.READY_FOR_REVIEW,
        ],
      },
    },
    data: {
      status: ProjectStatus.QUEUED,
      progress: 0,
      stage: 'Na fila',
      errorMessage: null,
    },
  });
  if (queued.count > 0) {
    await renderQueue.add(
      'render-project',
      { projectId, ambientMode: 'preview' },
      {
        jobId: `ambient-${projectId}-preview-${Date.now()}`,
        attempts: config.ambient.maxRetries,
      },
    );
  }
}

async function createOneAmbient(opts: {
  userId: string;
  recipeId: string;
  variationId: string;
  durationMinutes: number;
  format: 'youtube' | 'shorts';
  title?: string;
  audioLayers: string[];
  visualQueries: string[];
  autoConcept: boolean;
  autoSearch: boolean;
  generateThumbnail: boolean;
  generateMetadata: boolean;
  qualityCheck: boolean;
  seed: number;
  startPreview: boolean;
}) {
  const recipe = getMidnightRecipe(opts.recipeId);
  const variation = getMidnightVariation(recipe, opts.variationId);
  const maxDuration = config.ambient.maxDurationMinutes;
  if (opts.durationMinutes < 1 || opts.durationMinutes > maxDuration) {
    throw new ApiError(`A duração deve estar entre 1 e ${maxDuration} minutos.`);
  }

  const title =
    opts.title?.trim() && opts.title.trim().length >= 3
      ? opts.title.trim()
      : buildMidnightTitle({
          recipe,
          variation,
          durationMinutes: opts.durationMinutes,
        });

  const ambientConfig = {
    autoConcept: opts.autoConcept,
    autoSearch: opts.autoSearch,
    generateThumbnail: opts.generateThumbnail,
    generateMetadata: opts.generateMetadata,
    qualityCheck: opts.qualityCheck,
    format: opts.format,
    audioLayers: opts.audioLayers.length ? opts.audioLayers : recipe.audioLayers,
    visualQueries: opts.visualQueries.length ? opts.visualQueries : recipe.visualQueries,
    recipeId: recipe.id,
    variationId: variation.id,
  };

  const project = await prisma.project.create({
    data: {
      kind: ProjectKind.AMBIENT,
      title: title.slice(0, 80),
      userId: opts.userId,
      environment: recipe.environment,
      weather: recipe.weather,
      timeOfDay: recipe.time,
      purpose: variation.purpose,
      durationMinutes: opts.durationMinutes,
      preset: recipe.id,
      recipeId: recipe.id,
      recipeVersion: MIDNIGHT_RECIPE_VERSION,
      pipelineVersion: MIDNIGHT_PIPELINE_VERSION,
      universe: recipe.universe,
      variationId: variation.id,
      seriesId: recipe.seriesId,
      seriesEpisode: recipe.episode,
      seed: opts.seed,
      ambientConfigJson: ambientConfig as unknown as Prisma.InputJsonValue,
      conceptJson: {
        title: title.slice(0, 100),
        environment: recipe.environment,
        weather: recipe.weather,
        time: recipe.time,
        purpose: variation.purpose,
        durationMinutes: opts.durationMinutes,
        audioLayers: ambientConfig.audioLayers,
        visualQueries: ambientConfig.visualQueries,
        format: opts.format,
        universe: recipe.universe,
        recipeId: recipe.id,
        variationId: variation.id,
        seriesId: recipe.seriesId,
        seriesEpisode: recipe.episode,
        playlists: recipe.playlists,
        thumbnailStyle: recipe.thumbnailStyle,
        mainSound: recipe.mainSound,
        benefit: variation.benefit,
        experience: recipe.experience,
      } as unknown as Prisma.InputJsonValue,
      status: ProjectStatus.DRAFT,
    },
  });

  if (opts.startPreview) {
    await enqueuePreview(project.id);
  }

  return prisma.project.findUniqueOrThrow({ where: { id: project.id } });
}

export async function GET(): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const projects = await prisma.project.findMany({
      where: { kind: ProjectKind.AMBIENT, userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    return json({ projects });
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const body = (await request.json()) as CreateAmbientBody;

    const recipeIdRaw =
      (typeof body.recipeId === 'string' && body.recipeId.trim()) ||
      (typeof body.preset === 'string' && body.preset.trim()) ||
      null;
    const autoConcept = Boolean(body.autoConcept);
    if (!recipeIdRaw && !autoConcept) {
      throw new ApiError('Selecione uma receita Midnight.');
    }

    const recipe = getMidnightRecipe(recipeIdRaw);
    const format = body.format === 'shorts' ? 'shorts' : 'youtube';
    const audioLayers = parseStringArray(body.audioLayers);
    const visualQueries = parseStringArray(body.visualQueries);
    const startPreview = body.startPreview !== false;
    const baseSeed =
      typeof body.seed === 'number' && Number.isFinite(body.seed)
        ? Math.floor(body.seed)
        : Math.floor(Math.random() * 1_000_000);

    const createBatch = Boolean(body.createBatch);
    const variationIds = parseStringArray(body.variations);
    const durations = parseNumberArray(body.durations);

    const batchItems: BatchItem[] = [];
    if (createBatch) {
      const vars =
        variationIds.length > 0
          ? variationIds
          : recipe.variations.map((v) => v.id);
      const durs =
        durations.length > 0 ? durations : [recipe.defaultDurationsMin[0] ?? 60];
      for (const variationId of vars) {
        for (const durationMinutes of durs) {
          batchItems.push({ variationId, durationMinutes });
        }
      }
      if (batchItems.length > 24) {
        throw new ApiError('Lote máximo: 24 projetos por request.');
      }
    } else {
      const variationId =
        typeof body.variationId === 'string' && body.variationId.trim()
          ? body.variationId.trim()
          : recipe.variations[0]!.id;
      const durationMinutes =
        typeof body.durationMinutes === 'number' && body.durationMinutes > 0
          ? Math.round(body.durationMinutes)
          : config.ambient.defaultDurationMinutes;
      batchItems.push({ variationId, durationMinutes });
    }

    const projects = [];
    for (const [index, item] of batchItems.entries()) {
      const project = await createOneAmbient({
        userId: user.id,
        recipeId: recipe.id,
        variationId: item.variationId,
        durationMinutes: item.durationMinutes,
        format,
        title: typeof body.title === 'string' ? body.title : undefined,
        audioLayers,
        visualQueries,
        autoConcept,
        autoSearch: body.autoSearch !== false,
        generateThumbnail: body.generateThumbnail !== false,
        generateMetadata: body.generateMetadata !== false,
        qualityCheck: body.qualityCheck !== false,
        seed: baseSeed + index * 9973,
        startPreview,
      });
      projects.push(project);
    }

    if (createBatch) {
      return json({ projects, count: projects.length }, 201);
    }
    return json({ project: projects[0] }, 201);
  });
}
