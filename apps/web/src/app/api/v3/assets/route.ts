import type { NextRequest } from 'next/server';
import { listAssets } from '@editor-video/db/v3';
import { ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';

const KINDS = ['VIDEO', 'AUDIO', 'IMAGE', 'FONT', 'CHARACTER', 'DOCUMENT'] as const;

export async function GET(request: NextRequest): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const sp = request.nextUrl.searchParams;
    const kind = sp.get('kind');
    const assets = await listAssets(actor, {
      kind: KINDS.find((k) => k === kind),
      q: sp.get('q') ?? undefined,
      cursor: sp.get('cursor') ?? undefined,
      take: Number(sp.get('take') ?? 60),
    });
    return ok({ assets, nextCursor: assets.length > 0 ? assets[assets.length - 1]!.id : null });
  });
}
