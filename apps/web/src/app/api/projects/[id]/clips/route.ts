import path from 'node:path';
import type { NextRequest } from 'next/server';
import { config, getStorage, storageKeys } from '@editor-video/core/server';
import { prisma, ProjectStatus } from '@editor-video/db';
import { requireProjectAccess } from '@/lib/auth-guards';
import { ApiError, handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const ALLOWED_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi']);

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { id: projectId } = await params;
    await requireProjectAccess(projectId);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { clips: { orderBy: { position: 'asc' } } },
    });
    if (!project) throw new ApiError('Projeto não encontrado.', 404);
    if (project.status === ProjectStatus.PROCESSING || project.status === ProjectStatus.QUEUED) {
      throw new ApiError('O projeto está renderizando; aguarde para alterar os clipes.', 409);
    }

    const form = await request.formData();
    const files = form.getAll('files').filter((entry): entry is File => entry instanceof File);
    if (files.length === 0) throw new ApiError('Nenhum arquivo enviado.');

    const remaining = config.limits.maxClipsPerProject - project.clips.length;
    if (files.length > remaining) {
      throw new ApiError(
        `Limite de ${config.limits.maxClipsPerProject} clipes por projeto. Espaço restante: ${remaining}.`,
      );
    }

    let position = project.clips.reduce((max, clip) => Math.max(max, clip.position + 1), 0);
    const storage = getStorage();
    const created = [];

    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) {
        throw new ApiError(`Formato não suportado: "${file.name}". Use ${[...ALLOWED_EXT].join(', ')}.`);
      }
      if (file.size > config.limits.maxClipSizeBytes) {
        const limitMb = Math.round(config.limits.maxClipSizeBytes / 1024 / 1024);
        throw new ApiError(`"${file.name}" excede o limite de ${limitMb} MB.`);
      }

      const clip = await prisma.clip.create({
        data: {
          projectId,
          position: position++,
          originalName: file.name,
          sizeByte: file.size,
          sourceKey: 'pending',
          maxDurationSec: config.limits.maxClipDurationSec,
        },
      });

      const sourceKey = storageKeys.source(projectId, clip.id, ext);
      await storage.put(sourceKey, Buffer.from(await file.arrayBuffer()));
      created.push(await prisma.clip.update({ where: { id: clip.id }, data: { sourceKey } }));
    }

    return json({ clips: created }, 201);
  });
}
