'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { framesToMs, lyricLines, msToFrames, timelineRate } from '@editor-video/timeline';
import { formatMs, type LyricsMap, type LyricsStudioApi } from './types';

const HEIGHT = 150;
const BLOCK_TOP = 104;

type Drag = { itemId: string; mode: 'move' | 'start' | 'end'; originX: number; startMs: number; endMs: number; deltaMs: number };

/**
 * Waveform do trecho com bandas, batidas e onsets, e as linhas de letra como
 * blocos arrastáveis (mover, puxar início/fim). Clique busca; Shift+arrastar
 * marca o trecho em loop. Cada soltura vira UMA revisão.
 */
export function LyricsWaveform({ studio, map, durationMs }: { studio: LyricsStudioApi; map: LyricsMap | null; durationMs: number }) {
  const [pxPerSec, setPxPerSec] = useState(80);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [loopDraft, setLoopDraft] = useState<{ fromMs: number; toMs: number } | null>(null);
  const fps = timelineRate(studio.doc);
  const width = Math.max(300, Math.ceil((durationMs / 1000) * pxPerSec));
  const x = (ms: number) => (ms / 1000) * pxPerSec;
  const msAt = (clientX: number) => {
    const rect = scroller.current!.getBoundingClientRect();
    return Math.max(0, Math.min(durationMs, ((clientX - rect.left + scroller.current!.scrollLeft) / pxPerSec) * 1000));
  };
  const lines = useMemo(() => lyricLines(studio.doc), [studio.doc]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = HEIGHT * dpr;
    c.style.width = `${width}px`;
    c.style.height = `${HEIGHT}px`;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, width, HEIGHT);
    const css = getComputedStyle(document.documentElement);
    const muted = css.getPropertyValue('--muted').trim() || '#999';
    const accent = css.getPropertyValue('--accent').trim() || '#f25';
    const warn = css.getPropertyValue('--warn').trim() || '#fb2';
    // Régua de segundos.
    g.fillStyle = muted;
    g.font = '10px sans-serif';
    const every = pxPerSec >= 60 ? 1 : pxPerSec >= 25 ? 5 : 10;
    for (let s = 0; s * 1000 <= durationMs; s += every) {
      g.fillRect(x(s * 1000), 0, 1, 6);
      g.fillText(`${s}s`, x(s * 1000) + 2, 10);
    }
    if (!map) {
      g.fillText('Mapa musical ainda não disponível', 8, 40);
      return;
    }
    const step = map.sampleIntervalMs;
    const at = (i: number) => x(i * step + map.offsetMs);
    // Envelope RMS espelhado.
    g.fillStyle = 'rgba(154,154,174,0.45)';
    const mid = 44;
    for (let i = 0; i < map.rms.length; i += 1) g.fillRect(at(i), mid - map.rms[i]! * 28, Math.max(1, (step / 1000) * pxPerSec), map.rms[i]! * 56);
    // Graves (vermelho) e agudos (âmbar) como barras finas.
    for (let i = 0; i < map.bass.length; i += 1) {
      g.fillStyle = accent;
      g.globalAlpha = map.bass[i]!;
      g.fillRect(at(i), 78, Math.max(1, (step / 1000) * pxPerSec), 8);
      g.fillStyle = warn;
      g.globalAlpha = map.treble[i]!;
      g.fillRect(at(i), 88, Math.max(1, (step / 1000) * pxPerSec), 8);
    }
    g.globalAlpha = 1;
    g.fillStyle = '#ffffff';
    for (const b of map.beats) g.fillRect(x(b), 14, 1, 60);
    g.fillStyle = warn;
    for (const o of map.onsets) g.fillRect(x(o.timeMs), 70, 2, 6 * o.strength + 2);
  }, [map, width, pxPerSec, durationMs]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => setDrag((d) => (d ? { ...d, deltaMs: ((e.clientX - d.originX) / pxPerSec) * 1000 } : d));
    const onUp = () => {
      const d = drag;
      setDrag(null);
      if (!d || Math.abs(d.deltaMs) < 5) {
        if (d) studio.select(d.itemId);
        return;
      }
      const line = lines.find((l) => l.id === d.itemId);
      if (!line) return;
      let startMs = d.startMs;
      let endMs = d.endMs;
      if (d.mode !== 'end') startMs = Math.max(0, d.startMs + d.deltaMs);
      if (d.mode !== 'start') endMs = Math.min(durationMs, d.endMs + d.deltaMs);
      if (d.mode === 'move') endMs = startMs + (d.endMs - d.startMs);
      const start = msToFrames(startMs, fps);
      const duration = Math.max(1, msToFrames(endMs, fps) - start);
      // Mover desloca as palavras junto; puxar borda descarta palavras que ficariam fora.
      const shift = start - line.timelineStart;
      const words =
        d.mode === 'move'
          ? line.words.map((w) => ({ ...w, start: w.start + shift, end: w.end + shift }))
          : line.words.every((w) => w.start >= start && w.end <= start + duration)
            ? undefined
            : [];
      void studio.apply([{ op: 'setLyricLine', itemId: line.id, timelineStart: start, duration, ...(words !== undefined ? { words } : {}) }], `Tempo da linha "${line.text.slice(0, 30)}"`);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [drag, pxPerSec, lines, durationMs, fps, studio]);

  const startDrag = (e: React.PointerEvent, itemId: string, mode: Drag['mode'], startMs: number, endMs: number, locked: boolean) => {
    e.stopPropagation();
    if (locked) {
      studio.select(itemId);
      return;
    }
    setDrag({ itemId, mode, originX: e.clientX, startMs, endMs, deltaMs: 0 });
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    const ms = msAt(e.clientX);
    if (e.shiftKey) {
      setLoopDraft({ fromMs: ms, toMs: ms });
      const move = (ev: PointerEvent) => setLoopDraft((l) => (l ? { ...l, toMs: msAt(ev.clientX) } : l));
      window.addEventListener('pointermove', move);
      window.addEventListener(
        'pointerup',
        (ev) => {
          window.removeEventListener('pointermove', move);
          const to = msAt(ev.clientX);
          setLoopDraft(null);
          if (Math.abs(to - ms) > 200) studio.setLoop({ startMs: Math.min(ms, to), endMs: Math.max(ms, to) });
        },
        { once: true },
      );
      return;
    }
    studio.seekMs(ms);
  };

  const loop = loopDraft ? { startMs: Math.min(loopDraft.fromMs, loopDraft.toMs), endMs: Math.max(loopDraft.fromMs, loopDraft.toMs) } : studio.loop;

  return (
    <div className="lyrics-wave" aria-label="Waveform e linhas da letra">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
        <span className="muted">
          Clique para ir ao ponto · <span className="lyrics-kbd">Shift</span>+arrastar marca o loop · arraste os blocos ou as bordas para ajustar
          {map?.bpm ? ` · ${map.bpm.toFixed(1)} BPM` : ''}
        </span>
        <span className="row" style={{ gap: 6 }}>
          {studio.loop && <button className="ghost" onClick={() => studio.setLoop(null)}>Loop {formatMs(studio.loop.startMs)}–{formatMs(studio.loop.endMs)} ✕</button>}
          <label className="row" style={{ gap: 4 }}>
            Zoom
            <input type="range" min={10} max={300} value={pxPerSec} onChange={(e) => setPxPerSec(Number(e.target.value))} aria-label="Zoom da timeline" />
          </label>
        </span>
      </div>
      <div className="scroller" ref={scroller} onPointerDown={onBackgroundDown} style={{ height: HEIGHT + 12 }}>
        <canvas ref={canvas} />
        <div className="lanes" style={{ width, height: HEIGHT }}>
          {loop && <div className="loop" style={{ left: x(loop.startMs), width: x(loop.endMs - loop.startMs) }} />}
          {lines.map((line) => {
            let startMs = framesToMs(line.timelineStart, fps);
            let endMs = framesToMs(line.timelineStart + line.duration, fps);
            if (drag?.itemId === line.id) {
              if (drag.mode !== 'end') startMs = Math.max(0, drag.startMs + drag.deltaMs);
              if (drag.mode !== 'start') endMs = drag.endMs + drag.deltaMs;
              if (drag.mode === 'move') endMs = startMs + (drag.endMs - drag.startMs);
            }
            const base = { start: framesToMs(line.timelineStart, fps), end: framesToMs(line.timelineStart + line.duration, fps) };
            return (
              <div
                key={line.id}
                className="block"
                data-status={line.lyric!.status}
                aria-selected={studio.selected === line.id}
                title={`${line.text}\n${formatMs(startMs)} – ${formatMs(endMs)} · ${line.lyric!.status}`}
                style={{ left: x(startMs), width: Math.max(6, x(endMs - startMs)), top: BLOCK_TOP }}
                onPointerDown={(e) => startDrag(e, line.id, 'move', base.start, base.end, line.locked)}
              >
                <span className="edge l" onPointerDown={(e) => startDrag(e, line.id, 'start', base.start, base.end, line.locked)} />
                {line.text}
                <span className="edge r" onPointerDown={(e) => startDrag(e, line.id, 'end', base.start, base.end, line.locked)} />
              </div>
            );
          })}
          <div className="playhead" style={{ left: x(studio.playheadMs) }} />
        </div>
      </div>
    </div>
  );
}
