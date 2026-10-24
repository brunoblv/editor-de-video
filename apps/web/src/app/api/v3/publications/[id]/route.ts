import { z } from 'zod';
import { cancelPublication, markPublicationApproved, schedulePublication, updatePublicationMetadata } from '@editor-video/db/v3';
import { body, ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

/** Alterar metadados/capa/privacidade invalida a aprovação (volta a DRAFT). */
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    const { metadata } = z.object({ metadata: z.unknown() }).parse(await body(request));
    return ok({ publication: await updatePublicationMetadata(actor, id, metadata) });
  });
}

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('schedule'), scheduledAt: z.string().datetime({ offset: true }) }),
  z.object({ action: z.literal('cancel') }),
]);

/** POST /publications/:id  { action: approve | schedule | cancel } */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    const input = actionSchema.parse(await body(request));
    if (input.action === 'approve') return ok({ publication: await markPublicationApproved(actor, id) });
    if (input.action === 'schedule') return ok({ publication: await schedulePublication(actor, id, new Date(input.scheduledAt)) });
    return ok({ publication: await cancelPublication(actor, id) });
  });
}
