import { requestLyricsTranscription } from '@editor-video/db/v3';
import { ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

/** Pede a transcrição da letra (Whisper local) do trecho da música. */
export async function POST(_request: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return ok(await requestLyricsTranscription(actor, id), 202);
  });
}
