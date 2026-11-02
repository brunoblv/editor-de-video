import type { NextRequest } from 'next/server';
import { createSocialPost, listSocialPosts } from '@editor-video/db/v3';
import { DomainError } from '@editor-video/domain';
import { body, ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

/** Agenda do canal: ?from=ISO&to=ISO + rascunhos e posts com horário vencido. */
export async function GET(request: NextRequest, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    const sp = request.nextUrl.searchParams;
    const from = new Date(sp.get('from') ?? '');
    const to = new Date(sp.get('to') ?? '');
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new DomainError('INVALID', 'Informe from e to em ISO 8601.');
    return ok(await listSocialPosts(actor, id, { from, to }));
  });
}

export async function POST(request: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return ok({ post: await createSocialPost(actor, id, await body(request)) }, 201);
  });
}
