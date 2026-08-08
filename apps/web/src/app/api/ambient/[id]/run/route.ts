import type { NextRequest } from 'next/server';
import type { AmbientRenderMode } from '@editor-video/core';
import { prisma, ProjectKind, ProjectStatus } from '@editor-video/db';
import { renderQueue } from '@/lib/queue';
import { ApiError, handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const MODES = new Set<AmbientRenderMode>([
  'preview',
  'render',
  'regenerate_audio',
  'regenerate_visual',
  'regenerate_all',
]);

export async function POST(request: NextRequest, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { mode?: unknown };
    const modeRaw = typeof body.mode === 'string' ? body.mode : 'preview';
    if (!MODES.has(modeRaw as AmbientRenderMode)) {
      throw new ApiError('Modo inválido.');
    }
    const mode = modeRaw as AmbientRenderMode;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) throw new ApiError('Projeto não encontrado.', 404);
    if (project.kind !== ProjectKind.AMBIENT) {
      throw new ApiError('Este endpoint é apenas para projetos Ambient.');
    }
    if (project.status === ProjectStatus.QUEUED || project.status === ProjectStatus.PROCESSING) {
      throw new ApiError('Este projeto já está na fila de produção.', 409);
    }

    if (mode === 'render' && project.status !== ProjectStatus.WAITING_PREVIEW_APPROVAL) {
      throw new ApiError('Aprove o preview antes de renderizar o vídeo longo.');
    }

    if (
      (mode === 'regenerate_audio' ||
        mode === 'regenerate_visual' ||
        mode === 'regenerate_all') &&
      project.status !== ProjectStatus.WAITING_PREVIEW_APPROVAL &&
      project.status !== ProjectStatus.READY_FOR_REVIEW &&
      project.status !== ProjectStatus.FAILED
    ) {
      throw new ApiError('Só é possível regerar a partir do preview ou revisão.');
    }

    await prisma.project.update({
      where: { id },
      data: {
        status: ProjectStatus.QUEUED,
        progress: 0,
        stage: 'Na fila',
        errorMessage: null,
        ...(mode === 'render'
          ? { outputKey: null, outputSizeByte: null }
          : { previewKey: mode === 'preview' || mode.startsWith('regenerate') ? null : project.previewKey }),
      },
    });

    await renderQueue.add(
      'render-project',
      { projectId: id, ambientMode: mode },
      { jobId: `project:${id}:${Date.now()}` },
    );

    return json({ ok: true, mode });
  });
}
