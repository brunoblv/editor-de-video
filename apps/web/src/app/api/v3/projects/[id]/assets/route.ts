import { z } from 'zod';
import { addAssetToProject } from '@editor-video/db/v3';
import { body, ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  assetId: z.string(),
  expectedRevisionId: z.string(),
  append: z.boolean().default(true),
  trackId: z.string().optional(),
  imageDurationSec: z.number().positive().max(600).optional(),
});

/** Adiciona um asset da biblioteca à timeline (nova revisão). */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    const input = schema.parse(await body(request));
    return ok(await addAssetToProject(actor, id, input.assetId, input.expectedRevisionId, input), 201);
  });
}
