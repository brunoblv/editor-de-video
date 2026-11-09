import { getLyricsState } from '@editor-video/db/v3';
import { ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

/** Estado do projeto Lyrics: direitos, análise musical, trecho e QA da letra. */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return ok(await getLyricsState(actor, id));
  });
}
