import { retryJob } from '@editor-video/db/v3';
import { ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

/** Retry controlado (limite de tentativas; etapas concluídas são reaproveitadas). */
export async function POST(_req: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return ok(await retryJob(actor, id), 202);
  });
}
