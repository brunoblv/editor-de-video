import { z } from 'zod';
import { reimportLyrics } from '@editor-video/db/v3';
import { body, ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

const schema = z.object({ content: z.string().max(256 * 1024), fileName: z.string().max(255).nullable().optional(), expectedRevisionId: z.string() });

/** Reimporta a letra como nova revisão; linhas validadas são preservadas. */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return ok(await reimportLyrics(actor, id, schema.parse(await body(request))), 201);
  });
}
