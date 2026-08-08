import type { NextRequest } from 'next/server';
import { config } from '@editor-video/core';
import { prisma, ProjectKind, ProjectStatus } from '@editor-video/db';
import { requireProjectAccess } from '@/lib/auth-guards';
import { renderQueue } from '@/lib/queue';
import { ApiError, handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    await requireProjectAccess(id);

    const project = await prisma.project.findUnique({
      where: { id },
      include: { _count: { select: { clips: true } } },
    });
    if (!project) throw new ApiError('Projeto não encontrado.', 404);

    if (project.status === ProjectStatus.QUEUED || project.status === ProjectStatus.PROCESSING) {
      throw new ApiError('Este projeto já está na fila de produção.', 409);
    }

    if (project.kind === ProjectKind.AMBIENT) {
      throw new ApiError('Use /api/ambient/[id]/run para projetos Ambient.');
    }

    if (project.kind === ProjectKind.CURIOSIDADE) {
      if (!project.topic?.trim()) {
        throw new ApiError('Informe um tema antes de produzir.');
      }
    } else {
      const { minClipsPerProject } = config.limits;
      if (project._count.clips < minClipsPerProject) {
        throw new ApiError(
          `Adicione pelo menos ${minClipsPerProject} clipes antes de renderizar (atual: ${project._count.clips}).`,
        );
      }
    }

    const queued = await prisma.project.updateMany({
      where: {
        id,
        status: {
          in: [
            ProjectStatus.DRAFT,
            ProjectStatus.READY,
            ProjectStatus.FAILED,
            ProjectStatus.READY_FOR_REVIEW,
          ],
        },
      },
      data: {
        status: ProjectStatus.QUEUED,
        progress: 0,
        stage: 'Na fila',
        errorMessage: null,
        outputKey: null,
        outputSizeByte: null,
      },
    });
    if (queued.count === 0) {
      throw new ApiError('Este projeto já está na fila de produção.', 409);
    }

    await renderQueue.add(
      'render-project',
      { projectId: id },
      {
        jobId: `project-${id}-${Date.now()}`,
        attempts: config.ambient.maxRetries,
      },
    );

    return json({ ok: true });
  });
}
