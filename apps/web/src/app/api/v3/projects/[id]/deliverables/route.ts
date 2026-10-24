import { listDeliverables, projectUsage } from '@editor-video/db/v3';
import { ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

/** Entregas do projeto + consumo agregado (agente e jobs). */
export async function GET(_req: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    const [deliverables, usage] = await Promise.all([listDeliverables(actor, id), projectUsage(actor, id)]);
    return ok({ deliverables, usage });
  });
}
