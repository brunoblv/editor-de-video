import { prisma } from '@editor-video/db';
import { authorizeAsset } from '@editor-video/db/v3';
import { ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

/** Última versão da transcrição (tempos do ORIGINAL, em segundos). */
export async function GET(_req: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    await authorizeAsset(actor, id, 'project.view');
    const transcript = await prisma.transcriptVersion.findFirst({ where: { assetId: id }, orderBy: { version: 'desc' } });
    return ok({ transcript });
  });
}
