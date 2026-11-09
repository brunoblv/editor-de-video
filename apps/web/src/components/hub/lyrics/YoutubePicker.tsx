'use client';

import { useEffect, useRef, useState } from 'react';
import { api, describeError } from '../api';
import { formatMs } from './types';

type Result = { videoId: string; title: string; channel: string | null; durationSec: number | null; thumbnail: string | null; live: boolean };
export type PickedYoutubeAudio = { asset: { id: string; originalName: string; durationSec: number | null }; startSec: number; endSec: number; title: string; channel: string | null; rightsNote: string };

type YTPlayer = { getCurrentTime(): number; seekTo(sec: number, allowSeekAhead: boolean): void; playVideo(): void; destroy(): void };
type YTNamespace = { Player: new (el: HTMLElement, opts: { videoId: string; width?: string; height?: string; playerVars?: Record<string, number> }) => YTPlayer };

/** Carrega a IFrame API oficial uma vez (player do próprio YouTube, sem baixar nada para visualizar). */
function loadYoutubeApi(): Promise<YTNamespace> {
  const w = window as unknown as { YT?: YTNamespace & { loaded?: number }; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  return new Promise((resolve) => {
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(w.YT!);
    };
    if (!document.querySelector('script[data-yt-api]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.dataset.ytApi = '1';
      document.head.appendChild(script);
    }
  });
}

/**
 * Busca no YouTube, prévia no player oficial, marcação de começo e fim e
 * download do áudio (yt-dlp) só depois da declaração de direitos.
 */
export function YoutubePicker({ maxDurationSec, onPicked }: { maxDurationSec: number; onPicked: (picked: PickedYoutubeAudio) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Result | null>(null);
  const [range, setRange] = useState({ start: 0, end: 30 });
  const [rights, setRights] = useState({ declared: false, note: '' });
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);

  const search = async () => {
    setSearching(true);
    setError(null);
    try {
      setResults((await api<{ results: Result[] }>(`/api/v3/lyrics/youtube?q=${encodeURIComponent(query)}`)).results);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (!selected || !host.current) return;
    let cancelled = false;
    const el = document.createElement('div');
    host.current.replaceChildren(el);
    void loadYoutubeApi().then((YT) => {
      if (cancelled) return;
      player.current = new YT.Player(el, { videoId: selected.videoId, width: '100%', height: '100%', playerVars: { rel: 0, modestbranding: 1 } });
    });
    return () => {
      cancelled = true;
      player.current?.destroy();
      player.current = null;
    };
  }, [selected]);

  const choose = (r: Result) => {
    setSelected(r);
    setRange({ start: 0, end: Math.min(30, r.durationSec ?? 30) });
    setRights({ declared: false, note: '' });
  };
  const mark = (which: 'start' | 'end') => {
    const t = Math.round((player.current?.getCurrentTime() ?? 0) * 10) / 10;
    setRange((r) => (which === 'start' ? { start: t, end: Math.max(r.end, t + 1) } : { ...r, end: Math.max(t, r.start + 1) }));
  };

  const download = async () => {
    if (!selected) return;
    setDownloading(true);
    setError(null);
    try {
      const data = await api<{ asset: PickedYoutubeAudio['asset'] }>('/api/v3/lyrics/youtube', { method: 'POST', json: { videoId: selected.videoId, rights } });
      onPicked({ asset: data.asset, startSec: range.start, endSec: range.end, title: selected.title, channel: selected.channel, rightsNote: rights.note });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setDownloading(false);
    }
  };

  const tooLong = selected?.durationSec != null && selected.durationSec > maxDurationSec;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Artista, música…" style={{ flex: 1 }} aria-label="Buscar música no YouTube" />
        <button type="submit" disabled={searching || query.trim().length < 2}>{searching ? 'Buscando…' : 'Buscar'}</button>
      </form>
      {results && results.length === 0 && <div className="muted">Nada encontrado.</div>}
      {results && results.length > 0 && !selected && (
        <div style={{ display: 'grid', gap: 6, maxHeight: 320, overflow: 'auto' }}>
          {results.map((r) => (
            <button key={r.videoId} className="ghost" disabled={r.live} onClick={() => choose(r)} style={{ display: 'flex', gap: 8, alignItems: 'center', textAlign: 'left' }}>
              {r.thumbnail && <img src={r.thumbnail} alt="" width={96} height={54} style={{ objectFit: 'cover', borderRadius: 4 }} />}
              <span style={{ display: 'grid' }}>
                <strong style={{ fontSize: 13 }}>{r.title}</strong>
                <span className="muted" style={{ fontSize: 12 }}>{r.channel ?? '—'} · {r.durationSec != null ? formatMs(r.durationSec * 1000).replace(/\.\d+$/, '') : '?'}{r.live ? ' · ao vivo' : ''}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong style={{ fontSize: 13 }}>{selected.title}</strong>
            <button className="ghost" onClick={() => setSelected(null)}>Outro resultado</button>
          </div>
          <div ref={host} style={{ aspectRatio: '16 / 9', background: '#000', borderRadius: 8, overflow: 'hidden' }} />
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => mark('start')}>Marcar início ({formatMs(range.start * 1000)})</button>
            <button onClick={() => mark('end')}>Marcar fim ({formatMs(range.end * 1000)})</button>
            <button className="ghost" onClick={() => { player.current?.seekTo(range.start, true); player.current?.playVideo(); }}>Ouvir do início marcado</button>
            <span className="muted">trecho de {(range.end - range.start).toFixed(1)} s</span>
          </div>
          {tooLong && <div className="notice" data-tone="err">Vídeo com mais de {maxDurationSec} s: não pode ser usado.</div>}
          <div className="notice" data-tone="err" role="note">
            Baixar áudio do YouTube contraria os termos da plataforma, a menos que você tenha autorização. Música comercial costuma gerar reivindicação de direitos ou strike ao publicar. A origem fica registrada no projeto.
          </div>
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={rights.declared} onChange={(e) => setRights({ ...rights, declared: e.target.checked })} />
            Declaro que tenho autorização para usar este áudio (sou o autor, tenho licença ou o uso é permitido)
          </label>
          <input type="text" placeholder="Origem da autorização (ex.: música própria, licença X)" value={rights.note} onChange={(e) => setRights({ ...rights, note: e.target.value })} />
          <div>
            <button className="primary" disabled={!rights.declared || downloading || tooLong} onClick={() => void download()}>{downloading ? 'Baixando o áudio…' : 'Baixar áudio e usar este trecho'}</button>
          </div>
        </div>
      )}
      {error && <div className="notice" data-tone="err" role="alert">{error}</div>}
    </div>
  );
}
