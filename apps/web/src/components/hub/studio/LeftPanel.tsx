'use client';

import { useRef, useState } from 'react';
import { parseItem, removeRangeOps, sourceToTimeline, timelineRate, type TimelineOperation } from '@editor-video/timeline';
import { api, describeError, formatDuration, useApi } from '../api';
import type { StudioApi } from './types';

type Asset = { id: string; kind: string; status: string; originalName: string; durationSec: number | null; width: number | null; height: number | null };
type Segment = { text: string; startSec: number; endSec: number };
type Template = { id: string; slug: string; version: number; name: string; engine: string };

const TABS = ['Mídias', 'Cenas', 'Transcrição', 'Templates'] as const;

export function LeftPanel({ studio, projectId, channelId }: { studio: StudioApi; projectId: string; channelId: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Mídias');
  return (
    <div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === 'Mídias' && <MediaTab studio={studio} projectId={projectId} />}
      {tab === 'Cenas' && <ScenesTab studio={studio} />}
      {tab === 'Transcrição' && <TranscriptTab studio={studio} projectId={projectId} />}
      {tab === 'Templates' && <TemplatesTab studio={studio} channelId={channelId} />}
    </div>
  );
}

function MediaTab({ studio, projectId }: { studio: StudioApi; projectId: string }) {
  const { data, error, loading, reload } = useApi<{ assets: Asset[] }>('/api/v3/assets');
  const [status, setStatus] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const add = async (asset: Asset) => {
    try {
      await api(`/api/v3/projects/${projectId}/assets`, { method: 'POST', json: { assetId: asset.id, expectedRevisionId: studio.doc.revisionId } });
      await studio.reload();
      setStatus(`${asset.originalName} adicionado ao fim da trilha.`);
    } catch (err) {
      setStatus(describeError(err));
    }
  };
  const upload = async (files: FileList) => {
    for (const f of Array.from(files)) {
      setStatus(`Enviando ${f.name}…`);
      const res = await fetch(`/api/v3/assets/uploads?name=${encodeURIComponent(f.name)}&projectId=${projectId}&transcribe=1`, { method: 'POST', body: f });
      const data = await res.json().catch(() => ({}));
      setStatus(res.ok ? `${f.name} enviado; análise, proxy e transcrição na fila.` : `Upload interrompido: ${data.error ?? res.status}`);
    }
    await reload();
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <button onClick={() => file.current?.click()} disabled={studio.readOnly}>Enviar mídia</button>
      <input ref={file} type="file" multiple hidden onChange={(e) => e.target.files && void upload(e.target.files)} />
      {status && <div className="notice" role="status">{status}</div>}
      {loading && !data && <div className="state">Carregando…</div>}
      {error && <div className="notice" data-tone="err">{error}</div>}
      {data?.assets.length === 0 && <div className="state">Nenhuma mídia. Envie arquivos para começar.</div>}
      {data?.assets.map((a) => (
        <div key={a.id} className="card" style={{ padding: 8 }}>
          <div style={{ fontSize: 13 }}>{a.originalName}</div>
          <div className="stat">{a.kind} · {formatDuration(a.durationSec)} {a.width ? `· ${a.width}×${a.height}` : ''} · {a.status}{studio.doc.assets[a.id] ? ' · na timeline' : ''}</div>
          {['VIDEO', 'AUDIO', 'IMAGE'].includes(a.kind) && <button style={{ marginTop: 4 }} disabled={studio.readOnly || a.status === 'UPLOADING'} onClick={() => void add(a)}>Adicionar à timeline</button>}
        </div>
      ))}
    </div>
  );
}

function ScenesTab({ studio }: { studio: StudioApi }) {
  const videoAssets = Object.values(studio.doc.assets).filter((a) => a.kind === 'video');
  const [assetId, setAssetId] = useState(videoAssets[0]?.assetId ?? '');
  const { data, error, loading } = useApi<{ scenes: Array<{ startSec: number; endSec: number }> }>(assetId ? `/api/v3/assets/${assetId}/scenes` : null);
  if (videoAssets.length === 0) return <div className="state">Adicione um vídeo à timeline para ver as cenas.</div>;
  const asset = studio.doc.assets[assetId];
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <select value={assetId} onChange={(e) => setAssetId(e.target.value)} aria-label="Vídeo">
        {videoAssets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetId}</option>)}
      </select>
      {loading && <div className="state">Detectando cenas…</div>}
      {error && <div className="notice" data-tone="err">{error}</div>}
      {data?.scenes.map((s, i) => {
        const frames = asset ? sourceToTimeline(studio.doc, assetId, Math.round((s.startSec * asset.sourceTimebase.num) / asset.sourceTimebase.den)) : [];
        return (
          <button
            key={i}
            className="ghost"
            style={{ textAlign: 'left' }}
            onClick={() => {
              if (frames[0] !== undefined) studio.seek(frames[0]);
              const items = studio.doc.tracks.flatMap((t) => t.items).filter((it) => it.kind === 'clip' && it.assetId === assetId && frames.some((f) => f >= it.timelineStart && f < it.timelineStart + it.duration));
              studio.select(items.map((it) => it.id));
            }}
          >
            Cena {i + 1}: {s.startSec.toFixed(1)}s–{s.endSec.toFixed(1)}s {frames.length === 0 ? '(fora da edição)' : ''}
          </button>
        );
      })}
      <p className="stat">Selecionar uma cena delimita o próximo pedido ao Opus.</p>
    </div>
  );
}

function TranscriptTab({ studio, projectId }: { studio: StudioApi; projectId: string }) {
  const spoken = Object.values(studio.doc.assets).filter((a) => a.hasAudio && a.kind !== 'image');
  const [assetId, setAssetId] = useState(spoken[0]?.assetId ?? '');
  const { data, error, loading } = useApi<{ transcript: { id: string; version: number; reviewed: boolean; language: string; segmentsJson: Segment[] } | null }>(assetId ? `/api/v3/assets/${assetId}/transcripts` : null);
  const asset = studio.doc.assets[assetId];
  const fps = timelineRate(studio.doc);
  if (spoken.length === 0) return <div className="state">Nenhuma mídia com fala na timeline. Conteúdos sem fala (ex.: Ambient) não exigem transcrição.</div>;

  const toUnits = (sec: number) => (asset ? Math.round((sec * asset.sourceTimebase.num) / asset.sourceTimebase.den) : 0);
  const mapped = (seg: Segment) => {
    const start = sourceToTimeline(studio.doc, assetId, toUnits(seg.startSec))[0];
    const end = sourceToTimeline(studio.doc, assetId, Math.max(0, toUnits(seg.endSec) - 1))[0];
    return start !== undefined && end !== undefined ? { start, end: end + 1 } : null;
  };

  const removeSegment = (seg: Segment) => {
    const range = mapped(seg);
    if (!range) return;
    if (!window.confirm('Remover este trecho do VÍDEO (corta mídia e puxa o restante)?')) return;
    try {
      void studio.apply(removeRangeOps(studio.doc, range.start, range.end), `Remover trecho "${seg.text.slice(0, 40)}"`);
    } catch (err) {
      window.alert((err as Error).message);
    }
  };

  const generateCaptions = () => {
    const segments = data?.transcript?.segmentsJson ?? [];
    const track = studio.doc.tracks.find((t) => t.type === 'caption');
    if (!track) return;
    const ops: TimelineOperation[] = [];
    segments.forEach((seg, i) => {
      const range = mapped(seg);
      if (!range) return;
      const overlaps = track.items.some((it) => range.start < it.timelineStart + it.duration && it.timelineStart < range.end);
      if (overlaps) return;
      ops.push({ op: 'insertClip', trackId: track.id, item: parseItem({ id: `cap-${data!.transcript!.version}-${i}`, kind: 'caption', text: seg.text, language: data!.transcript!.language, timelineStart: range.start, duration: Math.max(1, range.end - range.start), transcriptRef: { transcriptId: data!.transcript!.id, segmentIndex: i } }) });
    });
    if (ops.length) void studio.apply(ops, 'Gerar legendas da transcrição');
  };

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <select value={assetId} onChange={(e) => setAssetId(e.target.value)} aria-label="Mídia">
        {spoken.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetId}</option>)}
      </select>
      {loading && <div className="state">Carregando transcrição…</div>}
      {error && <div className="notice" data-tone="err">{error}</div>}
      {data && !data.transcript && (
        <div className="state">
          Sem transcrição.{' '}
          <button onClick={() => void api(`/api/v3/assets/${assetId}/analyze`, { method: 'POST', json: { projectId, transcribe: true } }).then(() => window.alert('Transcrição enfileirada.')).catch((e) => window.alert(describeError(e)))}>Transcrever</button>
        </div>
      )}
      {data?.transcript && (
        <>
          <div className="stat">v{data.transcript.version} · {data.transcript.language} · {data.transcript.reviewed ? 'revisada' : 'não revisada'} — tempos do original</div>
          <button disabled={studio.readOnly} onClick={generateCaptions}>Gerar legendas</button>
          {data.transcript.segmentsJson.map((seg, i) => {
            const range = mapped(seg);
            return (
              <div key={i} className="card" style={{ padding: 6 }}>
                <button className="ghost" style={{ textAlign: 'left', width: '100%' }} disabled={!range} onClick={() => range && studio.seek(range.start)} title={range ? `Ir para ${(range.start * fps.den / fps.num).toFixed(2)}s` : 'Trecho fora da edição'}>
                  <span className="muted">{seg.startSec.toFixed(1)}s</span> {seg.text}
                </button>
                <div className="row" style={{ gap: 4 }}>
                  <button
                    className="ghost"
                    disabled={studio.readOnly}
                    onClick={() => {
                      const cap = studio.doc.tracks.flatMap((t) => t.items).find((it) => it.kind === 'caption' && it.transcriptRef?.segmentIndex === i && it.transcriptRef.transcriptId === data.transcript!.id);
                      if (!cap) return window.alert('Gere as legendas antes de corrigir o texto.');
                      const text = window.prompt('Texto corrigido (não altera cortes):', cap.kind === 'caption' ? cap.text : '');
                      if (text != null) void studio.apply([{ op: 'updateCaptions', edits: [{ itemId: cap.id, text }] }], 'Corrigir texto');
                    }}
                  >
                    Corrigir texto
                  </button>
                  <button className="ghost" disabled={studio.readOnly || !range} onClick={() => removeSegment(seg)}>Remover trecho do vídeo</button>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

const NEEDS_ART = ['rabisco-scene', 'arquetipo-ativacao'];

function TemplatesTab({ studio, channelId }: { studio: StudioApi; channelId: string }) {
  const { data } = useApi<{ channel: { templates: Template[] } }>(`/api/v3/channels/${channelId}`);
  const fps = timelineRate(studio.doc);
  const insert = (t: Template) => {
    const track = studio.doc.tracks.find((tr) => tr.type === 'text') ?? studio.doc.tracks.find((tr) => tr.type === 'video');
    if (!track) return;
    const duration = Math.round((5 * fps.num) / fps.den);
    void studio.apply([{ op: 'insertClip', trackId: track.id, item: parseItem({ id: `comp-${Date.now().toString(36)}`, kind: 'composition', templateId: t.slug, templateVersion: t.version, params: {}, timelineStart: studio.playhead, duration }) }], `Inserir ${t.name}`);
  };
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {data?.channel.templates.map((t) => (
        <div key={t.id} className="card" style={{ padding: 8 }}>
          <div style={{ fontSize: 13 }}>{t.name}</div>
          <div className="stat">{t.slug}@{t.version} · {t.engine}</div>
          {t.engine === 'hyperframes' && !NEEDS_ART.includes(t.slug) && <button disabled={studio.readOnly} onClick={() => insert(t)}>Inserir no cursor</button>}
          {NEEDS_ART.includes(t.slug) && <div className="stat">Requer arte do personagem: peça ao Opus para montar a cena.</div>}
        </div>
      ))}
    </div>
  );
}
