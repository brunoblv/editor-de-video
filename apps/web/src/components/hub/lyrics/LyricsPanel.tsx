'use client';

import { useEffect, useMemo, useState } from 'react';
import { framesToMs, lyricLines, msToFrames, parseItem, timelineRate, type CaptionItem, type CaptionWord } from '@editor-video/timeline';
import { formatMs, parseMs, type LyricsIssue, type LyricsStudioApi } from './types';

const STATUS_LABEL: Record<string, string> = { UNALIGNED: 'sem tempo', SUGGESTED: 'sugerida', LOW_CONFIDENCE: 'baixa confiança', VALIDATED: 'validada' };
const STATUS_TONE: Record<string, string> = { UNALIGNED: 'err', SUGGESTED: 'warn', LOW_CONFIDENCE: 'warn', VALIDATED: 'ok' };

/** Toque por palavra: cada toque fecha a palavra anterior e abre a próxima. */
type TapDraft = { itemId: string; stamps: number[] };

/**
 * Letra linha a linha: texto, início/fim (com ±1 frame), palavras, validação
 * (bloqueia a linha), offset global e sincronização por toque. Atalhos:
 * I = início no playhead, O = fim no playhead, T = toque da próxima palavra.
 */
export function LyricsPanel({ studio, issues, onReimport }: { studio: LyricsStudioApi; issues: LyricsIssue[]; onReimport: () => void }) {
  const fps = timelineRate(studio.doc);
  const lines = useMemo(() => lyricLines(studio.doc), [studio.doc]);
  const [offsetMs, setOffsetMs] = useState('0');
  const [tap, setTap] = useState<TapDraft | null>(null);
  const [openWords, setOpenWords] = useState<string | null>(null);
  const frameMs = (1000 * fps.den) / fps.num;
  const toMs = (f: number) => framesToMs(f, fps);
  const toFrames = (ms: number) => msToFrames(ms, fps);
  const byId = (id: string | null) => lines.find((l) => l.id === id) ?? null;
  const issuesOf = (id: string) => issues.filter((i) => i.itemId === id);

  const setTimes = (line: CaptionItem, startMs: number, endMs: number) => {
    const start = Math.max(0, toFrames(startMs));
    const duration = Math.max(1, toFrames(endMs) - start);
    const fits = line.words.every((w) => w.start >= start && w.end <= start + duration);
    return studio.apply([{ op: 'setLyricLine', itemId: line.id, timelineStart: start, duration, ...(fits ? {} : { words: [] }) }], `Tempo de "${line.text.slice(0, 30)}"`);
  };

  const markStart = (line: CaptionItem) => {
    const end = toMs(line.timelineStart + line.duration);
    const start = studio.playheadMs;
    void setTimes(line, start, end > start + frameMs ? end : start + 2000);
  };
  const markEnd = (line: CaptionItem) => {
    const start = toMs(line.timelineStart);
    if (studio.playheadMs <= start) return;
    void setTimes(line, start, studio.playheadMs);
  };

  const tokens = (line: CaptionItem) => line.text.split(/\s+/).filter(Boolean);
  const tapNext = () => {
    const line = byId(tap?.itemId ?? studio.selected);
    if (!line || line.locked) return;
    const draft = tap && tap.itemId === line.id ? tap : { itemId: line.id, stamps: [] };
    const words = tokens(line);
    const stamps = [...draft.stamps, Math.round(studio.playheadMs)];
    if (stamps.length < words.length) {
      setTap({ itemId: line.id, stamps });
      return;
    }
    // Último toque marcou a última palavra: o fim dela é o fim da linha (ou o playhead + 1 frame).
    setTap(null);
    const lineEndMs = Math.max(toMs(line.timelineStart + line.duration), stamps[stamps.length - 1]! + frameMs);
    const start = toFrames(stamps[0]!);
    const end = toFrames(lineEndMs);
    const next: CaptionWord[] = words.map((text, i) => ({ text, start: toFrames(stamps[i]!), end: i + 1 < words.length ? toFrames(stamps[i + 1]!) : end }));
    if (next.some((w) => w.end <= w.start)) return;
    void studio.apply([{ op: 'setLyricLine', itemId: line.id, text: words.join(' '), timelineStart: start, duration: end - start, words: next, source: 'manual' }], `Palavras de "${line.text.slice(0, 30)}" por toque`);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.metaKey) return;
      const line = byId(studio.selected);
      if (!line || line.locked) return;
      if (e.key === 'i' || e.key === 'I') markStart(line);
      else if (e.key === 'o' || e.key === 'O') markEnd(line);
      else if (e.key === 't' || e.key === 'T') tapNext();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const addLine = () => {
    const start = toFrames(studio.playheadMs);
    const item = parseItem({ id: `ly-${Date.now().toString(36)}`, kind: 'caption', text: 'nova linha', timelineStart: start, duration: toFrames(2000), lyric: { status: 'SUGGESTED', source: 'manual' } });
    const track = studio.doc.tracks.find((t) => t.role === 'lyrics')!;
    void studio.apply([{ op: 'insertClip', trackId: track.id, item }], 'Linha adicionada').then((ok) => ok && studio.select(item.id));
  };

  const validateAll = () => {
    const ids = lines.filter((l) => !l.locked && l.lyric!.status !== 'UNALIGNED').map((l) => l.id);
    if (ids.length) void studio.apply([{ op: 'validateLyrics', itemIds: ids, validated: true }], `${ids.length} linha(s) validadas`);
  };

  const applyOffset = () => {
    const ms = Number(offsetMs);
    if (!Number.isFinite(ms) || ms === 0) return;
    const track = studio.doc.tracks.find((t) => t.role === 'lyrics')!;
    void studio.apply([{ op: 'shiftLyrics', trackId: track.id, frames: toFrames(Math.abs(ms)) * Math.sign(ms) }], `Offset global ${ms > 0 ? '+' : ''}${ms} ms`).then((ok) => ok && setOffsetMs('0'));
  };

  const errors = issues.filter((i) => i.severity === 'error').length;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <button onClick={addLine}>+ Linha no playhead</button>
        <button onClick={validateAll} title="Valida e bloqueia todas as linhas sincronizadas">Validar sincronizadas</button>
        <button className="ghost" onClick={onReimport}>Reimportar letra…</button>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <label className="row" style={{ gap: 4 }}>
          Offset global (ms)
          <input type="number" step={10} value={offsetMs} onChange={(e) => setOffsetMs(e.target.value)} style={{ width: 90 }} aria-label="Offset global em milissegundos" />
        </label>
        <button onClick={applyOffset} disabled={!Number(offsetMs)}>Aplicar</button>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        Selecione uma linha e use <span className="lyrics-kbd">I</span> início, <span className="lyrics-kbd">O</span> fim, <span className="lyrics-kbd">T</span> toque por palavra (com a música tocando), <span className="lyrics-kbd">Espaço</span> tocar/pausar.
        {errors > 0 && <strong style={{ color: 'var(--accent)' }}> {errors} erro(s) bloqueiam o render final.</strong>}
      </p>
      {tap && (
        <div className="notice" role="status">
          Toque por palavra: {tap.stamps.length}/{tokens(byId(tap.itemId)!).length} marcadas.{' '}
          <button className="ghost" onClick={() => setTap(null)}>Cancelar</button>
        </div>
      )}

      <div className="lyrics-lines">
        {lines.map((line) => {
          const startMs = toMs(line.timelineStart);
          const endMs = toMs(line.timelineStart + line.duration);
          const active = studio.playheadMs >= startMs && studio.playheadMs < endMs;
          const own = issuesOf(line.id);
          const nextWord = tap?.itemId === line.id ? tap.stamps.length : -1;
          return (
            <div key={line.id} className="lyrics-line" aria-current={studio.selected === line.id} onClick={() => studio.select(line.id)} style={active ? { boxShadow: 'inset 3px 0 0 var(--accent)' } : undefined}>
              <div className="row" style={{ gap: 6, justifyContent: 'space-between' }}>
                <LineText line={line} disabled={line.locked} onSave={(text) => studio.apply([{ op: 'setLyricLine', itemId: line.id, text }], 'Texto da linha')} />
                <span className="chip" data-tone={STATUS_TONE[line.lyric!.status]}>{STATUS_LABEL[line.lyric!.status]}</span>
              </div>
              <div className="times">
                <button className="ghost" onClick={() => studio.seekMs(startMs)} title="Ir ao início">▶</button>
                <TimeField label="Início" ms={startMs} disabled={line.locked} onSave={(ms) => setTimes(line, ms, Math.max(ms + frameMs, endMs))} />
                <button className="ghost" disabled={line.locked} onClick={() => setTimes(line, startMs - frameMs, endMs)} aria-label="Início 1 frame antes">−1f</button>
                <button className="ghost" disabled={line.locked} onClick={() => setTimes(line, startMs + frameMs, endMs)} aria-label="Início 1 frame depois">+1f</button>
                <TimeField label="Fim" ms={endMs} disabled={line.locked} onSave={(ms) => setTimes(line, startMs, ms)} />
                <button className="ghost" disabled={line.locked} onClick={() => setTimes(line, startMs, endMs - frameMs)} aria-label="Fim 1 frame antes">−1f</button>
                <button className="ghost" disabled={line.locked} onClick={() => setTimes(line, startMs, endMs + frameMs)} aria-label="Fim 1 frame depois">+1f</button>
              </div>
              <div className="words">
                {line.words.length > 0
                  ? line.words.map((w, i) => <span key={i} title={`${formatMs(toMs(w.start))}–${formatMs(toMs(w.end))}${w.confidence !== undefined ? ` · confiança ${w.confidence.toFixed(2)}` : ''}`}>{w.text}</span>)
                  : tokens(line).map((t, i) => <span key={i} data-next={i === nextWord} className="muted">{t}</span>)}
                {line.words.length === 0 && <span className="muted" style={{ border: 'none' }}>modo linha (sem tempo por palavra)</span>}
              </div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <label className="row" style={{ gap: 4 }}>
                  <input
                    type="checkbox"
                    checked={line.lyric!.status === 'VALIDATED'}
                    disabled={line.lyric!.status === 'UNALIGNED'}
                    onChange={(e) => void studio.apply([{ op: 'validateLyrics', itemIds: [line.id], validated: e.target.checked }], e.target.checked ? 'Linha validada' : 'Linha reaberta')}
                  />
                  Validada
                </label>
                {!line.locked && <button className="ghost" onClick={() => setOpenWords(openWords === line.id ? null : line.id)}>Palavras…</button>}
                {!line.locked && <button className="ghost" onClick={() => { studio.select(line.id); setTap({ itemId: line.id, stamps: [] }); }}>Tocar palavras (T)</button>}
                {!line.locked && <button className="ghost" onClick={() => void studio.apply([{ op: 'removeClip', itemId: line.id }], 'Linha removida')}>Remover</button>}
              </div>
              {openWords === line.id && <WordsEditor line={line} toMs={toMs} toFrames={toFrames} onSave={(words) => studio.apply([{ op: 'setLyricLine', itemId: line.id, words, source: 'manual' }], 'Tempos das palavras')} />}
              {own.filter((i) => i.code !== 'NOT_VALIDATED').map((i, k) => (
                <div key={k} className="muted" style={{ fontSize: 12, color: i.severity === 'error' ? 'var(--accent)' : undefined }}>{i.severity === 'error' ? '✕' : '!'} {i.message}</div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LineText({ line, disabled, onSave }: { line: CaptionItem; disabled: boolean; onSave: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState(line.text);
  useEffect(() => setText(line.text), [line.text]);
  return (
    <input
      type="text"
      value={text}
      disabled={disabled}
      aria-label="Texto da linha"
      style={{ flex: 1, minWidth: 0 }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text.trim() && text !== line.text && void onSave(text.trim())}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function TimeField({ label, ms, disabled, onSave }: { label: string; ms: number; disabled: boolean; onSave: (ms: number) => unknown }) {
  const [text, setText] = useState(formatMs(ms));
  useEffect(() => setText(formatMs(ms)), [ms]);
  const commit = () => {
    const v = parseMs(text);
    if (v === null) setText(formatMs(ms));
    else if (v !== ms) onSave(v);
  };
  return (
    <label className="row" style={{ gap: 2 }}>
      {label}
      <input type="text" value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label={`${label} (m:ss.mmm)`} />
    </label>
  );
}

function WordsEditor({ line, toMs, toFrames, onSave }: { line: CaptionItem; toMs: (f: number) => number; toFrames: (ms: number) => number; onSave: (words: CaptionWord[]) => Promise<boolean> }) {
  const initial = line.words.length
    ? line.words.map((w) => ({ text: w.text, start: formatMs(toMs(w.start)), end: formatMs(toMs(w.end)) }))
    : line.text.split(/\s+/).filter(Boolean).map((t) => ({ text: t, start: '', end: '' }));
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const words: CaptionWord[] = [];
    for (const r of rows) {
      const s = parseMs(r.start);
      const e = parseMs(r.end);
      if (s === null || e === null || e <= s) {
        setError(`Tempo inválido em "${r.text}"`);
        return;
      }
      words.push({ text: r.text, start: toFrames(s), end: toFrames(e) });
    }
    setError(null);
    await onSave(words);
  };
  return (
    <div style={{ display: 'grid', gap: 4 }} onClick={(e) => e.stopPropagation()}>
      {rows.map((r, i) => (
        <div key={i} className="times">
          <span style={{ minWidth: 70 }}>{r.text}</span>
          <input type="text" placeholder="início" value={r.start} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} aria-label={`Início de ${r.text}`} />
          <input type="text" placeholder="fim" value={r.end} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} aria-label={`Fim de ${r.text}`} />
        </div>
      ))}
      {error && <div className="muted" style={{ color: 'var(--accent)' }}>{error}</div>}
      <div className="row" style={{ gap: 6 }}>
        <button onClick={() => void save()}>Salvar palavras</button>
        {line.words.length > 0 && <button className="ghost" onClick={() => void onSave([])}>Usar modo linha</button>}
      </div>
    </div>
  );
}

