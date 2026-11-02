'use client';

import { useApi } from '@/components/hub/api';

type Channel = {
  id: string;
  slug: string;
  name: string;
  nameConfirmed: boolean;
  tagline: string | null;
  languages: string[];
  active: boolean;
  series: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; platform: string; displayName: string | null; status: string }>;
  _count: { projects: number };
};

export default function ChannelsPage() {
  const { data, error, loading } = useApi<{ channels: Channel[] }>('/api/v3/channels');
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1>Canais</h1>
      <p className="muted">Cada canal é uma marca editorial com identidade, séries, templates, contas e regras próprias. Formato de vídeo e conta social são configurados separadamente.</p>
      {loading && <div className="state" role="status">Carregando canais…</div>}
      {error && <div className="notice" data-tone="err" role="alert">{error}</div>}
      <div className="cards">
        {data?.channels.map((c) => (
          <a key={c.id} className="card" href={`/hub/canais/${c.id}`}>
            <strong>{c.name}</strong> {!c.nameConfirmed && <span className="chip" data-tone="warn">nome provisório</span>} {!c.active && <span className="chip">inativo</span>}
            {c.tagline && <div className="stat">{c.tagline}</div>}
            <div className="stat" style={{ marginTop: 8 }}>
              {c.series.length} série(s) · {c._count.projects} projeto(s) · {c.accounts.length} conta(s) · {c.languages.join(', ')}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
