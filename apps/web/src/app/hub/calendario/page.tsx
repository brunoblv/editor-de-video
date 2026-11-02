'use client';

import { useMemo, useState } from 'react';
import { api, describeError, useApi, useSelectedChannel } from '@/components/hub/api';

type Publication = {
  id: string;
  state: string;
  platform: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  requestedScheduleAt: string | null;
  remoteId: string | null;
  historical: boolean;
  metadataJson: { title?: string; privacy?: string; coverHash?: string | null } | null;
  project: { id: string; title: string; channel: { id: string; name: string } };
  socialAccount: { id: string; displayName: string | null; platform: string; status: string } | null;
  deliverable: { id: string; variantId: string | null; width: number | null; height: number | null } | null;
};

const TZ = 'America/Sao_Paulo';
const VIEWS = { dia: 1, semana: 7, mês: 31 } as const;
const dayKey = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(iso));
const hour = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export default function CalendarPage() {
  const [channel] = useSelectedChannel();
  const [view, setView] = useState<keyof typeof VIEWS>('semana');
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [platform, setPlatform] = useState('');
  const [state, setState] = useState('');
  const end = new Date(start.getTime() + VIEWS[view] * 86400_000);
  const qs = new URLSearchParams({ from: start.toISOString(), to: end.toISOString(), ...(channel ? { channelId: channel } : {}), ...(platform ? { platform } : {}), ...(state ? { state } : {}) });
  const { data, error, loading, reload } = useApi<{ publications: Publication[] }>(`/api/v3/publications?${qs}`);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, Publication[]>();
    for (const p of data?.publications ?? []) {
      const when = p.scheduledAt ?? p.publishedAt ?? p.requestedScheduleAt;
      if (!when) continue;
      const k = dayKey(when);
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return [...map.entries()];
  }, [data]);

  const reschedule = async (p: Publication) => {
    const value = window.prompt('Novo horário (AAAA-MM-DD HH:MM, horário de Brasília):');
    if (!value) return;
    const iso = new Date(`${value.replace(' ', 'T')}:00-03:00`).toISOString();
    try {
      await api(`/api/v3/publications/${p.id}`, { method: 'POST', json: { action: 'schedule', scheduledAt: iso } });
      setMessage({ tone: 'ok', text: 'Reagendado após revalidar aprovação, conta e disponibilidade.' });
      await reload();
    } catch (err) {
      setMessage({ tone: 'err', text: describeError(err) });
    }
  };

  const shift = (dir: number) => setStart(new Date(start.getTime() + dir * VIEWS[view] * 86400_000));

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1>Calendário</h1>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {(Object.keys(VIEWS) as Array<keyof typeof VIEWS>).map((v) => (
          <button key={v} aria-pressed={view === v} className={view === v ? 'primary' : ''} onClick={() => setView(v)}>{v}</button>
        ))}
        <button onClick={() => shift(-1)} aria-label="Período anterior">←</button>
        <button onClick={() => shift(1)} aria-label="Próximo período">→</button>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Plataforma">
          <option value="">Todas as plataformas</option>
          {['YOUTUBE', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK'].map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={state} onChange={(e) => setState(e.target.value)} aria-label="Status">
          <option value="">Todos os status</option>
          {['DRAFT', 'APPROVED', 'SCHEDULED', 'UPLOADING', 'PROCESSING_REMOTE', 'PUBLISHED', 'FAILED', 'UNKNOWN', 'CANCELLED'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="muted">Fuso: {TZ} (armazenado em UTC)</span>
      </div>
      {message && <div className="notice" data-tone={message.tone} role="status">{message.text}</div>}
      {loading && !data && <div className="state" role="status">Carregando…</div>}
      {error && <div className="notice" data-tone="err" role="alert">{error}</div>}
      {data && groups.length === 0 && <div className="state">Nada neste período.</div>}
      {groups.map(([day, items]) => (
        <section key={day} className="card">
          <h2 style={{ textTransform: 'capitalize' }}>{day}</h2>
          <div className="cards">
            {items.map((p) => {
              const when = p.scheduledAt ?? p.publishedAt ?? p.requestedScheduleAt!;
              return (
                <article key={p.id} className="card" aria-label={p.metadataJson?.title ?? p.project.title}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong>{hour(when)}</strong>
                    <span className="chip" data-tone={p.state === 'PUBLISHED' ? 'ok' : p.state === 'FAILED' || p.state === 'UNKNOWN' ? 'err' : 'warn'}>{p.state}{p.requestedScheduleAt && p.state === 'DRAFT' ? ' · pausado (legado)' : ''}</span>
                  </div>
                  <div>{p.metadataJson?.title ?? p.project.title}</div>
                  <div className="stat">Destino: {p.project.channel.name} → {p.socialAccount ? `${p.socialAccount.displayName ?? p.platform} (${p.platform})` : 'conta não definida'}</div>
                  <div className="stat">Formato: {p.deliverable?.width ? `${p.deliverable.width}×${p.deliverable.height}` : '—'} · Capa: {p.metadataJson?.coverHash ? 'personalizada' : 'automática'} · {p.metadataJson?.privacy ?? '—'}</div>
                  {p.socialAccount && p.socialAccount.status !== 'CONNECTED' && <div className="notice" data-tone="err">Conta desconectada — reconecte ou use o pacote de postagem manual.</div>}
                  {!p.historical && ['DRAFT', 'APPROVED', 'SCHEDULED', 'FAILED'].includes(p.state) && (
                    <div className="row" style={{ gap: 6, marginTop: 8 }}>
                      <button onClick={() => void reschedule(p)}>Agendar / mover</button>
                      <a href={`/hub/projetos/${p.project.id}?tab=revisao`}>Revisar</a>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
