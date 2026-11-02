import { authorizeAsset, resolveAssetPath } from '@editor-video/db/v3';
import { DomainError } from '@editor-video/domain';
import { cutsToScenes, detectScenes } from '@editor-video/integrations';
import { ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Params = { params: Promise<{ id: string }> };

/** Cenas detectadas no proxy (vídeos curtos; longos devem ir pela fila de análise). */
export async function GET(_req: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    const asset = await authorizeAsset(actor, id, 'project.view');
    if (asset.kind !== 'VIDEO') throw new DomainError('INVALID', 'Asset não é vídeo.');
    if ((asset.durationSec ?? 0) > 20 * 60) throw new DomainError('LIMIT', 'Vídeo longo: use a análise em fila.');
    const local = await resolveAssetPath(id, true);
    const cuts = await detectScenes(local.path, 0.3);
    return ok({ scenes: cutsToScenes(cuts, asset.durationSec ?? 0) });
  });
}
