import { removeChannelMedia } from '@editor-video/db/v3';
import { ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string; assetId: string }> };

export async function DELETE(_req: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id, assetId } = await params;
    await removeChannelMedia(actor, id, assetId);
    return ok({ removed: true });
  });
}
