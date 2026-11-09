import { getLyricsMap } from '@editor-video/db/v3';
import { ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

/** Mapa musical no trecho da timeline (waveform, batidas, onsets, bandas). */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return ok(await getLyricsMap(actor, id));
  });
}
