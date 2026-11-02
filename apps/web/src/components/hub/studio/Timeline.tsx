'use client';

import { useRef, useState } from 'react';
import { formatTimecode, isLocked, timelineRate, type TimelineItem, type Track } from '@editor-video/timeline';
import type { StudioApi } from './types';

/**
 * Timeline MVP (§14.2): selecionar, mover, aparar, dividir, excluir,
 * bloquear, volume e texto (via Propriedades). Cada gesto concluído vira
 * UMA revisão; durante o arrasto só a pré-visualização local muda.
 */
type Drag = { itemId: string; mode: 'move' | 'trimL' | 'trimR'; startX: number; deltaFrames: number };

export function Timeline({ studio }: { studio: StudioApi }) {
  const { doc } = studio;
  const fps = timelineRate(doc);
  const fpsNum = fps.num / fps.den;
  const [pxPerSec, setPxPerSec] = useState(60);
  const [drag, setDrag] = useState<Drag | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const toPx = (frames: number) => (frames / fpsNum) * pxPerSec;
  const toFrames = (px: number) => Math.round((px / pxPerSec) * fpsNum);
  const totalSec = Math.max(10, doc.video.durationFrames / fpsNum + 5);
  const tracks = [...doc.tracks].sort((a, b) => a.order - b.order);
  const selected = studio.selection;

  const findItem = (id: string): { track: Track; item: TimelineItem } | null => {
    for (const track of doc.tracks) {
      const item = track.items.find((i) => i.id === id);
      if (item) return { track, item };
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent, item: TimelineItem, mode: Drag['mode']) => {
    e.stopPropagation();
    studio.select(e.shiftKey ? [...new Set([...selected, item.id])] : [item.id]);
    if (studio.readOnly || isLocked(doc, item.id)) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ itemId: item.id, mode, startX: e.clientX, deltaFrames: 0 });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, deltaFrames: toFrames(e.clientX - drag.startX) });
  };

  const onPointerUp = async () => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (d.deltaFrames === 0) return;
    const found = findItem(d.itemId);
    if (!found) return;
    const { item } = found;
    if (d.mode === 'move') {
      await studio.apply([{ op: 'moveClip', itemId: item.id, timelineStart: Math.max(0, item.timelineStart + d.deltaFrames) }], `Mover ${item.id}`);
      return;
    }
    if (item.kind === 'clip') {
      const asset = doc.assets[item.assetId];
      if (asset && asset.kind !== 'image') {
        // Converte o deslocamento da timeline para unidades da fonte.
        const unitsPerFrame = (asset.sourceTimebase.num / asset.sourceTimebase.den / fpsNum) * (item.playbackRate.num / item.playbackRate.den);
        const deltaUnits = Math.round(d.deltaFrames * unitsPerFrame);
        if (d.mode === 'trimL') {
          const sourceIn = Math.max(0, Math.min(item.sourceOut - 1, item.sourceIn + deltaUnits));
          const applied = Math.round((sourceIn - item.sourceIn) / unitsPerFrame);
          await studio.apply([{ op: 'trimClip', itemId: item.id, sourceIn, timelineStart: Math.max(0, item.timelineStart + applied) }], `Aparar início de ${item.id}`);
        } else {
          const max = asset.durationUnits ?? Number.MAX_SAFE_INTEGER;
          const sourceOut = Math.min(max, Math.max(item.sourceIn + 1, item.sourceOut + deltaUnits));
          await studio.apply([{ op: 'trimClip', itemId: item.id, sourceOut }], `Aparar fim de ${item.id}`);
        }
        return;
      }
    }
    if (d.mode === 'trimL') {
      const delta = Math.min(item.duration - 1, d.deltaFrames);
      await studio.apply([{ op: 'trimClip', itemId: item.id, timelineStart: Math.max(0, item.timelineStart + delta), duration: item.duration - delta }], `Aparar ${item.id}`);
    } else {
      await studio.apply([{ op: 'trimClip', itemId: item.id, duration: Math.max(1, item.duration + d.deltaFrames) }], `Aparar ${item.id}`);
    }
  };

  const geometry = (item: TimelineItem) => {
    let start = item.timelineStart;
    let duration = item.duration;
    if (drag?.itemId === item.id) {
      if (drag.mode === 'move') start = Math.max(0, start + drag.deltaFrames);
      if (drag.mode === 'trimL') {
        start += drag.deltaFrames;
        duration -= drag.deltaFrames;
      }
      if (drag.mode === 'trimR') duration += drag.deltaFrames;
    }
    return { left: toPx(start), width: Math.max(4, toPx(Math.max(1, duration))) };
  };

  const splitAtPlayhead = () => {
    const ops = selected
      .map(findItem)
      .filter((f): f is NonNullable<typeof f> => Boolean(f))
      .filter(({ item }) => studio.playhead > item.timelineStart && studio.playhead < item.timelineStart + item.duration)
      .map(({ item }) => ({ op: 'splitClip' as const, itemId: item.id, atFrame: studio.playhead, newItemId: `${item.id}-s${studio.playhead}` }));
    if (ops.length) void studio.apply(ops, 'Dividir no cursor');
  };
  const removeSelected = () => {
    if (selected.length === 0) return;
    void studio.apply(selected.map((itemId) => ({ op: 'removeClip' as const, itemId })), `Excluir ${selected.length} item(ns)`);
    studio.select([]);
  };
  const toggleLock = () => {
    const ops = selected.map(findItem).filter((f): f is NonNullable<typeof f> => Boolean(f)).map(({ item }) => ({ op: 'setLock' as const, itemId: item.id, locked: !item.locked }));
    if (ops.length) void studio.apply(ops, 'Alternar bloqueio');
  };

  const ticks = [];
  const step = pxPerSec >= 80 ? 1 : pxPerSec >= 30 ? 5 : 15;
  for (let s = 0; s <= totalSec; s += step) ticks.push(s);

  return (
    <section
      className="timeline"
      aria-label="Timeline"
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        if (e.key === 's' || e.key === 'S') splitAtPlayhead();
        if (e.key === 'Delete' || e.key === 'Backspace') removeSelected();
        if (e.key === 'l' || e.key === 'L') toggleLock();
      }}
      tabIndex={0}
    >
      <div className="timeline-toolbar">
        <span className="timecode">{formatTimecode(studio.playhead, fps)}</span>
        <button onClick={splitAtPlayhead} disabled={studio.readOnly || selected.length === 0} title="Dividir no cursor (S)">Dividir</button>
        <button onClick={removeSelected} disabled={studio.readOnly || selected.length === 0} title="Excluir (Delete)">Excluir</button>
        <button onClick={toggleLock} disabled={studio.readOnly || selected.length === 0} title="Bloquear/desbloquear (L)">Bloquear</button>
        <span className="muted" style={{ marginLeft: 'auto' }}>Zoom</span>
        <input type="range" min={10} max={200} value={pxPerSec} onChange={(e) => setPxPerSec(Number(e.target.value))} aria-label="Zoom da timeline" />
      </div>
      <div
        ref={area}
        style={{ position: 'relative', minWidth: 90 + totalSec * pxPerSec }}
        onPointerMove={onPointerMove}
        onPointerUp={() => void onPointerUp()}
      >
        <div
          className="tl-ruler"
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            studio.seek(Math.max(0, toFrames(e.clientX - rect.left)));
          }}
        >
          {ticks.map((s) => <span key={s} style={{ left: s * pxPerSec }}>{s}s</span>)}
          <div className="tl-playhead" style={{ left: toPx(studio.playhead), height: 18 + tracks.length * 38 }} />
        </div>
        {tracks.map((track) => (
          <div key={track.id} className="tl-row">
            <div className="tl-label">
              <span title={track.type}>{track.name ?? track.id}</span>
              {track.locked && <span aria-label="trilha bloqueada">🔒</span>}
              {track.muted && <span aria-label="trilha muda">🔇</span>}
            </div>
            <div className="tl-track" onClick={() => studio.select([])}>
              {track.items.map((item) => {
                const g = geometry(item);
                const locked = isLocked(doc, item.id);
                const label = item.kind === 'clip' ? item.assetId : item.kind === 'composition' ? item.templateId : item.text;
                return (
                  <div
                    key={item.id}
                    className="tl-item"
                    role="button"
                    tabIndex={0}
                    aria-selected={selected.includes(item.id)}
                    aria-label={`${item.kind} ${label}${locked ? ' (bloqueado)' : ''}`}
                    data-kind={item.kind}
                    data-track={track.type}
                    data-locked={locked}
                    style={{ left: g.left, width: g.width }}
                    onPointerDown={(e) => onPointerDown(e, item, 'move')}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') studio.select([item.id]);
                    }}
                    title={`${item.id} · ${(item.duration / fpsNum).toFixed(2)}s${locked ? ' · bloqueado' : ''}`}
                  >
                    {!locked && !studio.readOnly && <span className="handle l" onPointerDown={(e) => onPointerDown(e, item, 'trimL')} />}
                    {locked ? '🔒 ' : ''}
                    {label}
                    {!locked && !studio.readOnly && <span className="handle r" onPointerDown={(e) => onPointerDown(e, item, 'trimR')} />}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
