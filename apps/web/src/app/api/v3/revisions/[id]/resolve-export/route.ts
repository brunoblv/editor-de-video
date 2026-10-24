import { authorizeRevision, enqueueJob, V3_QUEUES } from '@editor-video/db/v3';
import { prisma } from '@editor-video/db';
import { ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

/** Exporta pacote de intercâmbio para o DaVinci Resolve (EDL + SRT + mídias + manifesto). */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    const revision = await authorizeRevision(actor, id, 'render.request');
    const deliverable = await prisma.deliverable.create({ data: { projectId: revision.projectId, revisionId: id, kind: 'RESOLVE_PACKAGE', state: 'PENDING', presetVersion: 'resolve-edl-v1' } });
    const job = await enqueueJob({
      projectId: revision.projectId,
      kind: 'RESOLVE_EXPORT',
      queue: V3_QUEUES.renderShort,
      revisionId: id,
      deliverableId: deliverable.id,
      requestedById: actor.userId,
      idempotencyKey: request.headers.get('idempotency-key'),
    });
    return ok({ jobId: job.id, deliverableId: deliverable.id }, 202);
  });
}
