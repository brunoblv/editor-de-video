import { z } from 'zod';
import { recordApproval } from '@editor-video/db/v3';
import { body, ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  socialAccountId: z.string(),
  metadata: z.unknown(),
  decision: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'REJECTED']),
  note: z.string().max(2000).nullable().optional(),
});

/** Aprova entrega + conta + metadados exatos (impressão digital vinculada). */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    const input = schema.parse(await body(request));
    return ok({ approval: await recordApproval(actor, { deliverableId: id, ...input }) }, 201);
  });
}
