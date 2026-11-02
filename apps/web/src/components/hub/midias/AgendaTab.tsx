'use client';

import { useMemo, useState } from 'react';
import { useApi } from '@/components/hub/api';
import { PostDialog } from './PostDialog';
import { dayKey, dayStartIso, hourLabel, PLATFORMS, postLabel, type MediaAsset, type SocialPost } from './shared';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DEFAULT_HOUR = '20:00';
const pad = (n: number) => String(n).padStart(2, '0');

type Agenda = { posts: SocialPost[]; drafts: SocialPost[]; due: SocialPost[] };
type Editing = { post: SocialPost | null; defaultWhen: string };
type Props = { channelId: string; media: MediaAsset[]; reloadMedia: () => Promise<void> };

function PostButton({ post, due, onOpen, withDay }: { post: SocialPost; due?: boolean; onOpen: (p: SocialPost) => void; withDay?: boolean }) {
  const networks = post.targets.map((t) => PLATFORMS[t.platform]).join(', ');
  const when = post.scheduledAt ? `${withDay ? `${dayKey(post.scheduledAt).split('-').reverse().slice(0, 2).join('/')} ` : ''}${hourLabel(post.scheduledAt)} · ` : '';
  const label = `${when}${postLabel(post)}`;
  return (
    <button className="agenda-post" data-state={post.state} data-due={due ? 'true' : undefined} onClick={() => onOpen(post)} title={`${label}${networks ? ` (${networks})` : ''}`}>
      {label}
    </button>
  );
}

export function AgendaTab({ channelId, media, reloadMedia }: Props) {
  const today = dayKey(new Date());
  const [month, setMonth] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }));
  const [editing, setEditing] = useState<Editing | null>(null);

  const firstKey = `${month.year}-${pad(month.month + 1)}-01`;
  const next = month.month === 11 ? { year: month.year + 1, month: 0 } : { year: month.year, month: month.month + 1 };
  const url = `/api/v3/channels/${channelId}/posts?${new URLSearchParams({ from: dayStartIso(firstKey), to: dayStartIso(`${next.year}-${pad(next.month + 1)}-01`) })}`;
  const { data, error, loading, reload } = useApi<Agenda>(url);

  const shift = (dir: number) => {
    const d = new Date(Date.UTC(month.year, month.month + dir, 1));
    setMonth({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  };

  const byDay = useMemo(() => {
    const map = new Map<string, SocialPost[]>();
    for (const post of data?.posts ?? []) {
      const key = dayKey(post.scheduledAt!);
      map.set(key, [...(map.get(key) ?? []), post]);
    }
    return map;
  }, [data]);

  const blanks = new Date(Date.UTC(month.year, month.month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(month.year, month.month + 1, 0)).getUTCDate();
  const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(month.year, month.month, 1))).replace(/^./, (c) => c.toUpperCase());
  const dueIds = new Set(data?.due.map((p) => p.id));
  const open = (post: SocialPost) => setEditing({ post, defaultWhen: '' });

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {data && data.due.length > 0 && (
        <section className="card" aria-label="Hora de postar" style={{ display: 'grid', gap: 6 }}>
          <strong>Hora de postar ({data.due.length})</strong>
          {data.due.map((post) => <PostButton key={post.id} post={post} due withDay onOpen={open} />)}
        </section>
      )}

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => shift(-1)} aria-label="Mês anterior">←</button>
        <strong style={{ minWidth: 170, textAlign: 'center' }}>{monthLabel}</strong>
        <button onClick={() => shift(1)} aria-label="Próximo mês">→</button>
        <button className="primary" onClick={() => setEditing({ post: null, defaultWhen: '' })}>Novo post</button>
        <span className="muted">Horários de Brasília</span>
      </div>

      {error && <div className="notice" data-tone="err" role="alert">{error}</div>}
      {loading && !data && <div className="state" role="status">Carregando agenda…</div>}

      <div className="agenda-head" aria-hidden>{WEEKDAYS.map((d) => <div key={d}>{d}</div>)}</div>
      <div className="agenda-grid">
        {Array.from({ length: blanks }, (_, i) => <div key={`blank-${i}`} data-blank="true" className="agenda-day" style={{ visibility: 'hidden' }} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const key = `${month.year}-${pad(month.month + 1)}-${pad(i + 1)}`;
          const past = key < today;
          const posts = byDay.get(key) ?? [];
          return (
            <div key={key} className="agenda-day" data-today={key === today} data-past={past} data-blank={posts.length === 0 && key !== today && past ? 'true' : undefined}>
              <div className="top">
                <span><span className="agenda-weekday">{WEEKDAYS[(blanks + i) % 7]} </span>{i + 1}</span>
                {!past && <button className="add" onClick={() => setEditing({ post: null, defaultWhen: `${key}T${DEFAULT_HOUR}` })} aria-label={`Novo post em ${pad(i + 1)}/${pad(month.month + 1)}`}>+</button>}
              </div>
              {posts.map((post) => <PostButton key={post.id} post={post} due={dueIds.has(post.id)} onOpen={open} />)}
            </div>
          );
        })}
      </div>

      <section className="card" aria-label="Rascunhos" style={{ display: 'grid', gap: 6 }}>
        <strong>Rascunhos ({data?.drafts.length ?? 0})</strong>
        {data?.drafts.length === 0 && <span className="stat">Nenhum rascunho.</span>}
        {data?.drafts.map((post) => <PostButton key={post.id} post={post} onOpen={open} />)}
      </section>

      {editing && (
        <PostDialog
          channelId={channelId}
          post={editing.post}
          defaultWhen={editing.defaultWhen}
          media={media}
          reloadMedia={reloadMedia}
          onClose={() => setEditing(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}
