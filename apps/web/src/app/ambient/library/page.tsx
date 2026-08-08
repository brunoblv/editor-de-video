import Link from 'next/link';
import { prisma } from '@editor-video/db';
import { AmbientLibrary, type SoundAssetDTO } from '@/components/AmbientLibrary';

export const dynamic = 'force-dynamic';

export default async function AmbientLibraryPage() {
  const assets = await prisma.soundAsset.findMany({
    orderBy: { createdAt: 'desc' },
  });

  const dto: SoundAssetDTO[] = assets.map((a) => ({
    id: a.id,
    name: a.name,
    category: a.category,
    subcategory: a.subcategory,
    provider: a.provider,
    license: a.license,
    licenseVerdict: a.licenseVerdict,
    durationSec: a.durationSec,
    qualityScore: a.qualityScore,
    loopScore: a.loopScore,
    localKey: a.localKey,
    tags: a.tags,
  }));

  return (
    <main>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Biblioteca de sons</h1>
        <Link href="/ambient" className="muted">
          ← Ambientes
        </Link>
      </div>
      <p className="muted" style={{ marginBottom: 24 }}>
        Assets locais seguros. O planner consulta a biblioteca antes de buscar externamente.
      </p>
      <AmbientLibrary initialAssets={dto} />
    </main>
  );
}
