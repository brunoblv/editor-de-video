import { z } from 'zod';
import { authorizeAsset, authorizeProject, enqueueJob, V3_QUEUES } from '@editor-video/db/v3';
import { DomainError } from '@editor-video/domain';
import { body, ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

const schema = z.object({ projectId: z.string(), transcribe: z.boolean().default(false), language: z.string().max(16).optional() });

/** Enfileira inspeção/proxy (e transcrição opcional). Responde com jobId. */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    const input = schema.parse(await body(request));
    const asset = await authorizeAsset(actor, id, 'asset.upload');
    const project = await authorizeProject(actor, input.projectId, 'project.edit');
    if (project.workspaceId !== asset.workspaceId) throw new DomainError('NOT_FOUND', 'Asset não encontrado.');
    const job = await enqueueJob({
      projectId: project.id,
      kind: input.transcribe ? 'TRANSCRIBE' : 'ANALYZE',
      queue: V3_QUEUES.analysis,
      assetId: asset.id,
      params: { transcribe: input.transcribe, language: input.language },
      requestedById: actor.userId,
      idempotencyKey: request.headers.get('idempotency-key'),
    });
    return ok({ jobId: job.id }, 202);
  });
}
