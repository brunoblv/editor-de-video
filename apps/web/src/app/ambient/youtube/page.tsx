import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MIDNIGHT_BRAND, MIDNIGHT_PLAYLISTS } from '@editor-video/core/midnight';
import { prisma } from '@editor-video/db';
import { auth } from '@/auth';
import { youtubeConfigured } from '@/lib/youtube';
import { YoutubeConnectButton } from '@/components/YoutubeConnectButton';

export const dynamic = 'force-dynamic';

export default async function YoutubeSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const params = await searchParams;
  const channel = await prisma.youTubeChannel.findUnique({
    where: { userId: session.user.id },
  });

  return (
    <main>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>YouTube · {MIDNIGHT_BRAND}</h1>
        <Link href="/ambient" className="muted">
          ← Ambient
        </Link>
      </div>
      <p className="muted">
        Conecte o canal para publicar vídeos longos e Shorts com playlists Midnight.
      </p>

      {params.error ? <div className="error">OAuth: {params.error}</div> : null}
      {params.connected ? (
        <div className="badge" data-status="READY_FOR_REVIEW">
          Canal conectado
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Status</h2>
        <p className="muted">
          Credenciais Google:{' '}
          {youtubeConfigured() ? 'configuradas' : 'ausentes (GOOGLE_CLIENT_ID / SECRET)'}
        </p>
        {channel ? (
          <>
            <p>
              <strong>{channel.channelTitle}</strong>
              <span className="muted"> · {channel.channelId}</span>
            </p>
            <p className="muted">
              Conectado em {channel.connectedAt.toLocaleString('pt-BR')}
            </p>
          </>
        ) : (
          <p className="muted">Nenhum canal conectado.</p>
        )}
        <YoutubeConnectButton disabled={!youtubeConfigured()} />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Playlists Midnight</h2>
        <ul>
          {MIDNIGHT_PLAYLISTS.map((p) => (
            <li key={p.key}>
              <strong>{p.title}</strong>
              <div className="muted">{p.description}</div>
            </li>
          ))}
        </ul>
        <p className="muted">
          Ao conectar, as playlists são criadas automaticamente se ainda não existirem.
        </p>
      </div>
    </main>
  );
}
