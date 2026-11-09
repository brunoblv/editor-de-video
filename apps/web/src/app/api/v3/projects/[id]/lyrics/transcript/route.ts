import { z } from 'zod';
import { applyLyricsTranscript } from '@editor-video/db/v3';
import { body, ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

const schema = z.object({ expectedRevisionId: z.string() });

/** Aplica a última transcrição sobre as linhas não validadas (nova revisão). */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return ok(await applyLyricsTranscript(actor, id, schema.parse(await body(request))), 201);
  });
}
