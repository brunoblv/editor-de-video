import { z } from 'zod';
import { requestRender } from '@editor-video/db/v3';
import { body, ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

const schema = z.object({ quality: z.enum(['preview', 'final']), variantId: z.string().nullable().optional() });

/** Solicita prévia/final. Assíncrono: responde 202 com jobId. */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    const input = schema.parse(await body(request));
    const result = await requestRender(actor, { revisionId: id, quality: input.quality, variantId: input.variantId ?? null, idempotencyKey: request.headers.get('idempotency-key') });
    return ok(result, 202);
  });
}
