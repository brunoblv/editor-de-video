import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { NextRequest } from 'next/server';
import { DomainError } from '@editor-video/domain';
import { enqueueJob, registerAssetFromStream, V3_QUEUES } from '@editor-video/db/v3';
import { prisma } from '@editor-video/db';
import { ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Upload por streaming (corpo bruto), sem carregar o arquivo em memória:
 *   POST /api/v3/assets/uploads?name=clip.mp4[&workspaceId=…&license=…&projectId=…]
 * Registra o original por hash e enfileira a análise (proxy/inspeção).
 */
export async function POST(request: NextRequest): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const sp = request.nextUrl.searchParams;
    const name = sp.get('name');
    if (!name) throw new DomainError('INVALID', 'Informe ?name= com o nome do arquivo.');
    if (!request.body) throw new DomainError('INVALID', 'Corpo vazio.');
    const workspaceId = sp.get('workspaceId') ?? actor.workspaceId;
    const declared = request.headers.get('content-length');
    const asset = await registerAssetFromStream(actor, {
      workspaceId,
      originalName: path.basename(name),
      mimeType: request.headers.get('content-type'),
      license: sp.get('license'),
      author: sp.get('author'),
      sourceUrl: sp.get('sourceUrl'),
      tags: sp.getAll('tag'),
      stream: Readable.fromWeb(request.body as import('node:stream/web').ReadableStream),
      tmpDir: path.join(process.env.V3_UPLOAD_TMP ?? os.tmpdir(), 'editor-video-uploads'),
      declaredSize: declared ? BigInt(declared) : undefined,
    });

    // A análise precisa de um projeto para o job; usa o informado ou o mais recente.
    const projectId = sp.get('projectId') ?? (await prisma.videoProject.findFirst({ where: { workspaceId }, orderBy: { updatedAt: 'desc' }, select: { id: true } }))?.id;
    let jobId: string | null = null;
    if (projectId && (asset.kind === 'VIDEO' || asset.kind === 'AUDIO') && !asset.proxyKey) {
      const job = await enqueueJob({
        projectId,
        kind: 'ANALYZE',
        queue: V3_QUEUES.analysis,
        assetId: asset.id,
        params: { transcribe: sp.get('transcribe') === '1', language: sp.get('language') ?? undefined },
        requestedById: actor.userId,
        idempotencyKey: `analyze:${asset.id}:${sp.get('transcribe') === '1' ? 't' : 'n'}`,
      });
      jobId = job.id;
    }
    return ok({ asset, jobId }, 201);
  });
}
