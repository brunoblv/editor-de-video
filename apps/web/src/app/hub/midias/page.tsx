'use client';

import { useApi } from '@/components/hub/api';

type Channel = { id: string; name: string; tagline: string | null; accounts: unknown[]; _count: { media: number; posts: number } };

export default function MediaCenterPage() {
  const { data, error, loading } = useApi<{ channels: Channel[] }>('/api/v3/channels');
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1>Central de mídias</h1>
      <p className="muted" style={{ margin: 0 }}>Cada canal tem as próprias mídias e a própria agenda de posts.</p>
      {loading && !data && <div className="state" role="status">Carregando canais…</div>}
      {error && <div className="notice" data-tone="err" role="alert">{error}</div>}
      <div className="cards">
        {data?.channels.map((c) => (
          <a key={c.id} href={`/hub/midias/${c.id}`} className="card" style={{ display: 'grid', gap: 6, margin: 0, color: 'inherit' }}>
            <strong>{c.name}</strong>
            {c.tagline && <span className="stat">{c.tagline}</span>}
            <span className="stat">{c._count.media} mídia(s) · {c._count.posts} post(s)</span>
          </a>
        ))}
      </div>
    </div>
  );
}
