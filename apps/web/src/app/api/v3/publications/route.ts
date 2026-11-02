import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createPublicationDraft, listCalendar } from '@editor-video/db/v3';
import { body, ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';

/** Calendário: ?from=ISO&to=ISO[&channelId&platform&state]. Armazenamento em UTC. */
export async function GET(request: NextRequest): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const sp = request.nextUrl.searchParams;
    const from = new Date(sp.get('from') ?? Date.now() - 7 * 86400_000);
    const to = new Date(sp.get('to') ?? Date.now() + 31 * 86400_000);
    const publications = await listCalendar(actor, {
      from,
      to,
      channelId: sp.get('channelId') ?? undefined,
      platform: sp.get('platform') ?? undefined,
      state: sp.get('state') ?? undefined,
    });
    return ok({ publications });
  });
}

const schema = z.object({ deliverableId: z.string(), socialAccountId: z.string(), metadata: z.unknown(), intent: z.string().max(40).optional() });

/** Cria distribuição (rascunho) de UMA entrega para UMA conta. Idempotente por chave. */
export async function POST(request: Request): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    return ok({ publication: await createPublicationDraft(actor, schema.parse(await body(request))) }, 201);
  });
}
