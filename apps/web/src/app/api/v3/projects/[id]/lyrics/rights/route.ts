import { z } from 'zod';
import { declareLyricsRights } from '@editor-video/db/v3';
import { body, ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

const schema = z.object({ declared: z.boolean(), note: z.string().max(1000).nullable().optional() });

/** Declaração de autorização de uso do áudio e da letra (exigida no render final). */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return ok({ lyrics: await declareLyricsRights(actor, id, schema.parse(await body(request))) });
  });
}
