import { requestLyricsAnalysis } from '@editor-video/db/v3';
import { ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

/** Pede (de novo) a análise musical; com o mesmo áudio e versão, sai do cache. */
export async function POST(_request: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return ok(await requestLyricsAnalysis(actor, id), 202);
  });
}
