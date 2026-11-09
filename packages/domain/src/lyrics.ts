/**
 * Reactive Lyrics Studio — contratos e regras independentes de renderer
 * (docs/reactive-lyrics-studio-requisitos.md §6).
 *
 * Convenções:
 * - Relógio canônico em milissegundos inteiros (§7.3); a composição converte
 *   para frames conforme o fps.
 * - Tempos de letra ficam como importados/corrigidos; o deslocamento global
 *   (`offsetMs`, RF-016) é aplicado só ao resolver, então pode ser refeito.
 * - Palavra sem início/fim é não alinhada. Nada aqui inventa tempo por
 *   interpolação: linha sem tempo por palavra é exibida em modo linha (RF-012).
 */
import { z } from 'zod';

export const MUSICAL_MAP_SCHEMA_VERSION = 1;
export const LYRIC_ALIGNMENT_SCHEMA_VERSION = 1;

const ms = z.number().int().nonnegative();
const unit = z.number().min(0).max(1);
const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_.:-]+$/, 'ID com caracteres inválidos');

export const SECTION_TYPES = ['intro', 'verse', 'pre_chorus', 'chorus', 'bridge', 'solo', 'outro', 'other'] as const;

export const musicalSectionSchema = z.object({
  id,
  type: z.enum(SECTION_TYPES),
  startMs: ms,
  endMs: ms,
  /** manual prevalece sobre sugestão (RF-025). */
  source: z.enum(['manual', 'suggestion']),
});

export const musicalMapSchema = z
  .object({
    schemaVersion: z.literal(MUSICAL_MAP_SCHEMA_VERSION),
    audioAssetId: z.string().nullable().default(null),
    audioHash: z.string().min(16),
    durationMs: z.number().int().positive(),
    /** Versão do algoritmo — compõe a chave de cache (RF-029). */
    analysisVersion: z.string().min(1),
    /** Estimativa; null quando não há pulso confiável (RF-020). */
    bpmEstimate: z.number().positive().nullable(),
    beatTimesMs: z.array(ms),
    onsets: z.array(z.object({ timeMs: ms, strength: unit })),
    features: z.object({
      sampleIntervalMs: z.number().int().positive(),
      rms: z.array(unit),
      bass: z.array(unit),
      mids: z.array(unit),
      treble: z.array(unit),
    }),
    sections: z.array(musicalSectionSchema).default([]),
  })
  .superRefine((map, ctx) => {
    const expected = Math.ceil(map.durationMs / map.features.sampleIntervalMs);
    for (const key of ['rms', 'bass', 'mids', 'treble'] as const) {
      if (Math.abs(map.features[key].length - expected) > 1) {
        ctx.addIssue({ code: 'custom', path: ['features', key], message: `Série com ${map.features[key].length} amostras; esperado ~${expected}` });
      }
    }
    const sortedInside = (times: number[], path: string) => {
      times.forEach((t, i) => {
        if (t > map.durationMs) ctx.addIssue({ code: 'custom', path: [path, i], message: 'Instante além da duração' });
        if (i > 0 && t <= times[i - 1]!) ctx.addIssue({ code: 'custom', path: [path, i], message: 'Instantes devem ser crescentes' });
      });
    };
    sortedInside(map.beatTimesMs, 'beatTimesMs');
    sortedInside(map.onsets.map((o) => o.timeMs), 'onsets');
    const sections = [...map.sections].sort((a, b) => a.startMs - b.startMs);
    sections.forEach((s, i) => {
      if (s.endMs <= s.startMs) ctx.addIssue({ code: 'custom', path: ['sections', s.id], message: 'Seção com fim antes do início' });
      if (s.endMs > map.durationMs) ctx.addIssue({ code: 'custom', path: ['sections', s.id], message: 'Seção além da duração' });
      if (i > 0 && s.startMs < sections[i - 1]!.endMs) ctx.addIssue({ code: 'custom', path: ['sections', s.id], message: 'Seções sobrepostas' });
    });
  });

export const lyricWordSchema = z.object({
  id,
  text: z.string().min(1).max(200),
  startMs: ms.nullable(),
  endMs: ms.nullable(),
  /** Confiança do alinhador; null para tempo importado ou manual. */
  confidence: unit.nullable().default(null),
});

export const LYRIC_LINE_STATUSES = ['UNALIGNED', 'SUGGESTED', 'LOW_CONFIDENCE', 'VALIDATED'] as const;

export const lyricLineSchema = z.object({
  id,
  text: z.string().max(500),
  /** Estrofe de origem (linha em branco no texto separa estrofes). */
  stanza: z.number().int().nonnegative().default(0),
  startMs: ms.nullable(),
  endMs: ms.nullable(),
  /** Só uma pessoa marca VALIDATED (RF-015); importação e alinhador sugerem. */
  status: z.enum(LYRIC_LINE_STATUSES),
  source: z.enum(['import', 'aligner', 'manual']),
  words: z.array(lyricWordSchema),
});

export const lyricAlignmentSchema = z.object({
  schemaVersion: z.literal(LYRIC_ALIGNMENT_SCHEMA_VERSION),
  language: z.string().min(2).max(16).nullable().default(null),
  /** Deslocamento global aplicado a todas as linhas e palavras (RF-016). */
  offsetMs: z.number().int().min(-60_000).max(60_000).default(0),
  lines: z.array(lyricLineSchema),
});

export type MusicalSection = z.infer<typeof musicalSectionSchema>;
export type MusicalMap = z.infer<typeof musicalMapSchema>;
export type LyricWord = z.infer<typeof lyricWordSchema>;
export type LyricLine = z.infer<typeof lyricLineSchema>;
export type LyricAlignment = z.infer<typeof lyricAlignmentSchema>;

// ---------------------------------------------------------------------------
// Importação de letra (RF-009)
// ---------------------------------------------------------------------------

export type LyricFormat = 'txt' | 'lrc' | 'srt' | 'vtt';

export function detectLyricFormat(fileName: string, content: string): LyricFormat {
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext === 'lrc' || ext === 'srt' || ext === 'vtt') return ext;
  if (/^﻿?WEBVTT/.test(content)) return 'vtt';
  if (/^\s*\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/m.test(content)) return 'lrc';
  if (/\d{2}:\d{2}:\d{2},\d{3}\s*-->/.test(content)) return 'srt';
  return 'txt';
}

export type ParseLyricsOptions = {
  /** Fecha a última linha de LRC (que não tem fim explícito). */
  durationMs?: number;
  language?: string | null;
};

type DraftWord = { text: string; startMs: number | null; endMs: number | null };
type DraftLine = { text: string; stanza: number; startMs: number | null; endMs: number | null; words: DraftWord[] };

export function parseLyrics(content: string, format: LyricFormat, options: ParseLyricsOptions = {}): LyricAlignment {
  const text = content.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const parsed =
    format === 'lrc' ? parseLrc(text, options.durationMs) : format === 'srt' ? parseCues(text, false) : format === 'vtt' ? parseCues(text, true) : { lines: parseTxt(text), offsetMs: 0 };
  return lyricAlignmentSchema.parse({
    schemaVersion: LYRIC_ALIGNMENT_SCHEMA_VERSION,
    language: options.language ?? null,
    offsetMs: parsed.offsetMs,
    lines: parsed.lines.map((line, i) => {
      const timed = line.startMs !== null && line.endMs !== null;
      return {
        id: `l${i + 1}`,
        text: line.text,
        stanza: line.stanza,
        startMs: line.startMs,
        endMs: line.endMs,
        status: timed ? 'SUGGESTED' : 'UNALIGNED',
        source: 'import',
        words: line.words.map((w, j) => ({ id: `l${i + 1}-w${j + 1}`, ...w, confidence: null })),
      };
    }),
  });
}

function splitWords(text: string): DraftWord[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ({ text: t, startMs: null, endMs: null }));
}

function parseTxt(text: string): DraftLine[] {
  const lines: DraftLine[] = [];
  let stanza = 0;
  let blank = false;
  for (const raw of text.split('\n')) {
    const value = raw.trim();
    if (!value) {
      blank = lines.length > 0;
      continue;
    }
    if (blank) stanza += 1;
    blank = false;
    lines.push({ text: value, stanza, startMs: null, endMs: null, words: splitWords(value) });
  }
  return lines;
}

/** mm:ss.xx | mm:ss:xx | hh:mm:ss.xxx → ms */
function clockToMs(value: string): number {
  const parts = value.replace(',', '.').split(':');
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + Number(part);
  if (!Number.isFinite(seconds)) throw new Error(`Tempo inválido: ${value}`);
  return Math.round(seconds * 1000);
}

function lrcClockToMs(value: string): number {
  // LRC: [mm:ss.xx] ou a variante [mm:ss:xx] (centésimos após dois-pontos).
  const m = /^(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?$/.exec(value);
  if (!m) throw new Error(`Tempo LRC inválido: ${value}`);
  const frac = m[3] ? Number(`0.${m[3]}`) : 0;
  return Math.round((Number(m[1]) * 60 + Number(m[2]) + frac) * 1000);
}

function parseLrc(text: string, durationMs?: number): { lines: DraftLine[]; offsetMs: number } {
  let offsetMs = 0;
  const entries: Array<{ startMs: number; text: string; words: DraftWord[]; order: number; stanza: number }> = [];
  let stanza = 0;
  let blank = false;
  let order = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      blank = entries.length > 0;
      continue;
    }
    const meta = /^\[([a-z]+):(.*)\]$/i.exec(line);
    if (meta) {
      // [offset:+500] adianta a letra em 500 ms.
      if (meta[1]!.toLowerCase() === 'offset') offsetMs = -Math.round(Number(meta[2]!.trim()) || 0);
      continue;
    }
    const stamps: number[] = [];
    let rest = line;
    let m: RegExpExecArray | null;
    while ((m = /^\[(\d{1,3}:\d{2}(?:[.:]\d{1,3})?)\]/.exec(rest))) {
      stamps.push(lrcClockToMs(m[1]!));
      rest = rest.slice(m[0].length);
    }
    if (stamps.length === 0) continue;
    if (blank && rest.trim()) stanza += 1;
    blank = false;
    const { text: lineText, words } = parseInlineWordTimes(rest, /<(\d{1,3}:\d{2}(?:[.:]\d{1,3})?)>/g, lrcClockToMs);
    // Linha com vários tempos = refrão repetido: cada ocorrência é uma linha própria (RF-017).
    for (const startMs of stamps) entries.push({ startMs, text: lineText, words: words.map((w) => ({ ...w })), order: order++, stanza });
  }
  entries.sort((a, b) => a.startMs - b.startMs || a.order - b.order);

  const lines: DraftLine[] = [];
  entries.forEach((entry, i) => {
    if (!entry.text) return; // linha vazia em LRC marca o fim da anterior
    const next = entries[i + 1];
    const lastWordEnd = entry.words.reduce<number | null>((acc, w) => (w.endMs !== null ? Math.max(acc ?? 0, w.endMs) : acc), null);
    let endMs = next ? next.startMs : durationMs ?? lastWordEnd ?? null;
    if (endMs !== null && lastWordEnd !== null && lastWordEnd > endMs) endMs = lastWordEnd;
    const words = entry.words.length ? entry.words : splitWords(entry.text);
    // Palavra com início marcado e sem fim fecha no início da próxima (ou fim da linha).
    for (let j = 0; j < words.length; j += 1) {
      const w = words[j]!;
      if (w.startMs !== null && w.endMs === null) w.endMs = words[j + 1]?.startMs ?? endMs;
    }
    lines.push({ text: entry.text, stanza: entry.stanza, startMs: entry.startMs, endMs: endMs !== null && endMs > entry.startMs ? endMs : null, words });
  });
  return { lines, offsetMs };
}

/**
 * Tempos por palavra embutidos na linha: `<00:01.20>A <00:01.50>luz` (LRC
 * estendido) ou `<00:00:01.200>` (VTT). Só marca a palavra se toda a linha
 * tiver marcação — tempo parcial seria interpolação escondida.
 */
function parseInlineWordTimes(raw: string, pattern: RegExp, toMs: (v: string) => number): { text: string; words: DraftWord[] } {
  const clean = (s: string) => s.replace(/<[^>]*>/g, '');
  const pieces: Array<{ startMs: number | null; text: string }> = [];
  let last = 0;
  let currentStart: number | null = null;
  for (const m of raw.matchAll(pattern)) {
    pieces.push({ startMs: currentStart, text: raw.slice(last, m.index) });
    currentStart = toMs(m[1]!);
    last = m.index! + m[0].length;
  }
  pieces.push({ startMs: currentStart, text: raw.slice(last) });
  const text = clean(raw).replace(/\s+/g, ' ').trim();
  const words: DraftWord[] = [];
  for (const piece of pieces) {
    for (const [k, w] of clean(piece.text).split(/\s+/).filter(Boolean).entries()) {
      words.push({ text: w, startMs: k === 0 ? piece.startMs : null, endMs: null });
    }
  }
  const allTimed = words.length > 0 && words.every((w) => w.startMs !== null);
  return { text, words: allTimed ? words : [] };
}

function msToVttClock(value: number): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(value / 3_600_000))}:${pad(Math.floor(value / 60_000) % 60)}:${pad(Math.floor(value / 1000) % 60)}.${pad(value % 1000, 3)}`;
}

function parseCues(text: string, vtt: boolean): { lines: DraftLine[]; offsetMs: number } {
  const lines: DraftLine[] = [];
  const blocks = text.split(/\n{2,}/);
  const timing = /((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3})/;
  for (const block of blocks) {
    const rows = block.split('\n').map((r) => r.trim());
    const at = rows.findIndex((r) => timing.test(r));
    if (at < 0) continue;
    const m = timing.exec(rows[at]!)!;
    const startMs = clockToMs(m[1]!);
    const endMs = clockToMs(m[2]!);
    const body = rows.slice(at + 1).filter(Boolean);
    if (body.length === 0) continue;
    // Quebras dentro da legenda são preservadas no texto.
    const joined = body.join('\n');
    const lineText = body.map((r) => r.replace(/<[^>]*>/g, '').trim()).join('\n');
    let words = splitWords(lineText);
    if (vtt) {
      // No VTT o texto antes do primeiro <tempo> começa no início da legenda.
      const inline = parseInlineWordTimes(`<${msToVttClock(startMs)}>${body.join(' ')}`, /<((?:\d{1,2}:)?\d{2}:\d{2}\.\d{3})>/g, clockToMs);
      if (inline.words.length && inline.words.length === words.length && /<\d/.test(joined)) {
        words = inline.words;
        for (let j = 0; j < words.length; j += 1) words[j]!.endMs = words[j + 1]?.startMs ?? endMs;
      }
    }
    lines.push({ text: lineText, stanza: 0, startMs, endMs: endMs > startMs ? endMs : null, words });
  }
  return { lines, offsetMs: 0 };
}

// ---------------------------------------------------------------------------
// Validação e resolução para composição
// ---------------------------------------------------------------------------

export type LyricIssue = {
  lineId: string;
  wordId?: string;
  severity: 'error' | 'warning';
  code: 'UNALIGNED' | 'INVERTED' | 'NEGATIVE' | 'BEYOND_AUDIO' | 'WORD_OUTSIDE_LINE' | 'WORD_OVERLAP' | 'LINE_OVERLAP' | 'NOT_VALIDATED' | 'LOW_CONFIDENCE';
  message: string;
};

const LOW_CONFIDENCE = 0.6;

/** Problemas de tempo da letra (RF-015, RF-051, RF-059). `durationMs` é a duração do áudio. */
export function lyricIssues(alignment: LyricAlignment, durationMs: number): LyricIssue[] {
  const issues: LyricIssue[] = [];
  const off = alignment.offsetMs;
  let previous: { id: string; endMs: number } | null = null;
  for (const line of alignment.lines) {
    if (line.startMs === null || line.endMs === null) {
      issues.push({ lineId: line.id, severity: 'error', code: 'UNALIGNED', message: `"${line.text}" sem tempo` });
      continue;
    }
    const start = line.startMs + off;
    const end = line.endMs + off;
    if (start < 0) issues.push({ lineId: line.id, severity: 'error', code: 'NEGATIVE', message: 'Começa antes do áudio (confira o offset)' });
    if (end <= start) issues.push({ lineId: line.id, severity: 'error', code: 'INVERTED', message: 'Fim antes do início' });
    if (end > durationMs) issues.push({ lineId: line.id, severity: 'error', code: 'BEYOND_AUDIO', message: 'Termina depois do áudio' });
    if (previous && start < previous.endMs) issues.push({ lineId: line.id, severity: 'warning', code: 'LINE_OVERLAP', message: `Sobrepõe ${previous.id} (canto sobreposto?)` });
    if (line.status !== 'VALIDATED') issues.push({ lineId: line.id, severity: 'warning', code: 'NOT_VALIDATED', message: 'Linha ainda não validada' });
    let prevWordEnd = -1;
    for (const w of line.words) {
      if (w.startMs === null || w.endMs === null) continue;
      if (w.endMs <= w.startMs) issues.push({ lineId: line.id, wordId: w.id, severity: 'error', code: 'INVERTED', message: `"${w.text}" com fim antes do início` });
      if (w.startMs < line.startMs || w.endMs > line.endMs) issues.push({ lineId: line.id, wordId: w.id, severity: 'error', code: 'WORD_OUTSIDE_LINE', message: `"${w.text}" fora do intervalo da linha` });
      if (w.startMs < prevWordEnd) issues.push({ lineId: line.id, wordId: w.id, severity: 'warning', code: 'WORD_OVERLAP', message: `"${w.text}" sobrepõe a palavra anterior` });
      if (w.confidence !== null && w.confidence < LOW_CONFIDENCE) issues.push({ lineId: line.id, wordId: w.id, severity: 'warning', code: 'LOW_CONFIDENCE', message: `"${w.text}" com confiança ${w.confidence.toFixed(2)}` });
      prevWordEnd = w.endMs;
    }
    previous = { id: line.id, endMs: end };
  }
  return issues;
}

export type ResolvedLine = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  /** null = modo linha: não há tempo confiável para todas as palavras (RF-012). */
  words: Array<{ text: string; startMs: number; endMs: number }> | null;
};

/** Aplica o offset e devolve só linhas com tempo, prontas para a composição. */
export function resolveLyrics(alignment: LyricAlignment): ResolvedLine[] {
  const off = alignment.offsetMs;
  const out: ResolvedLine[] = [];
  for (const line of alignment.lines) {
    if (line.startMs === null || line.endMs === null) continue;
    const startMs = line.startMs + off;
    const endMs = line.endMs + off;
    if (endMs <= startMs || endMs <= 0) continue;
    const timed = line.words.length > 0 && line.words.every((w) => w.startMs !== null && w.endMs !== null && w.endMs > w.startMs);
    out.push({
      id: line.id,
      text: line.text,
      startMs,
      endMs,
      words: timed ? line.words.map((w) => ({ text: w.text, startMs: w.startMs! + off, endMs: w.endMs! + off })) : null,
    });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/** Valor de uma série no instante pedido, com interpolação linear (§7.3). */
export function sampleSeries(series: readonly number[], sampleIntervalMs: number, timeMs: number): number {
  if (series.length === 0) return 0;
  const pos = Math.max(0, timeMs) / sampleIntervalMs;
  const i = Math.floor(pos);
  if (i >= series.length - 1) return series[series.length - 1]!;
  const frac = pos - i;
  return series[i]! * (1 - frac) + series[i + 1]! * frac;
}

/**
 * Recorta mapa e letra para um trecho [startMs, startMs + durationMs), com
 * tempos relativos ao início do trecho (prévia segmentada, RF-049).
 */
export function sliceForSegment(
  map: MusicalMap,
  lines: ResolvedLine[],
  startMs: number,
  durationMs: number,
): { map: MusicalMap; lines: ResolvedLine[] } {
  const endMs = Math.min(map.durationMs, startMs + durationMs);
  const len = endMs - startMs;
  if (len <= 0) throw new Error('Trecho fora do áudio');
  const step = map.features.sampleIntervalMs;
  const from = Math.floor(startMs / step);
  const count = Math.ceil(len / step);
  const cut = (s: number[]) => s.slice(from, from + count);
  const inside = (t: number) => t >= startMs && t < endMs;
  const clip = (t: number) => Math.min(len, Math.max(0, t - startMs));
  return {
    map: musicalMapSchema.parse({
      ...map,
      durationMs: len,
      beatTimesMs: map.beatTimesMs.filter(inside).map((t) => t - startMs),
      onsets: map.onsets.filter((o) => inside(o.timeMs)).map((o) => ({ ...o, timeMs: o.timeMs - startMs })),
      features: { sampleIntervalMs: step, rms: cut(map.features.rms), bass: cut(map.features.bass), mids: cut(map.features.mids), treble: cut(map.features.treble) },
      sections: map.sections
        .filter((s) => s.endMs > startMs && s.startMs < endMs)
        .map((s) => ({ ...s, startMs: clip(s.startMs), endMs: clip(s.endMs) }))
        .filter((s) => s.endMs > s.startMs),
    }),
    lines: lines
      .filter((l) => l.endMs > startMs && l.startMs < endMs)
      .map((l) => ({
        ...l,
        startMs: clip(l.startMs),
        endMs: clip(l.endMs),
        words: l.words ? l.words.map((w) => ({ ...w, startMs: clip(w.startMs), endMs: clip(w.endMs) })) : null,
      })),
  };
}

// ---------------------------------------------------------------------------
// Letra transcrita (Whisper)
// ---------------------------------------------------------------------------

export type TranscribedSegment = {
  text: string;
  startSec: number;
  endSec: number;
  words: Array<{ text: string; startSec: number; endSec: number; confidence?: number }>;
};

/** Linha transcrita com no máximo este número de palavras; acima disso divide na maior pausa. */
const MAX_WORDS_PER_LINE = 9;

/**
 * Segmentos do Whisper → linhas de letra com tempo por palavra e origem
 * `asr`. Nunca entram validadas: palavra com confiança < 0,6 marca a linha
 * como LOW_CONFIDENCE; as demais ficam SUGGESTED (RF-015). `offsetSec` soma
 * ao tempo do segmento (ex.: início do trecho transcrito na música).
 */
export function transcriptToLyricLines(segments: TranscribedSegment[], offsetSec = 0): LyricLine[] {
  type W = { text: string; startMs: number; endMs: number; confidence: number | null };
  const groups: W[][] = [];
  const split = (words: W[]) => {
    if (words.length <= MAX_WORDS_PER_LINE) {
      if (words.length) groups.push(words);
      return;
    }
    let cut = Math.floor(words.length / 2);
    let gap = -1;
    for (let i = 2; i < words.length - 1; i += 1) {
      const g = words[i]!.startMs - words[i - 1]!.endMs;
      if (g > gap) {
        gap = g;
        cut = i;
      }
    }
    split(words.slice(0, cut));
    split(words.slice(cut));
  };
  for (const seg of segments) {
    const words = seg.words
      .map((w) => ({
        text: w.text.trim(),
        startMs: Math.max(0, Math.round((w.startSec + offsetSec) * 1000)),
        endMs: Math.max(0, Math.round((w.endSec + offsetSec) * 1000)),
        confidence: typeof w.confidence === 'number' ? Math.max(0, Math.min(1, w.confidence)) : null,
      }))
      .filter((w) => w.text);
    // Palavra sem duração ganha 1 ms para não ficar invertida; o QA mostra a confiança.
    for (const w of words) if (w.endMs <= w.startMs) w.endMs = w.startMs + 1;
    if (words.length) split(words);
    else if (seg.text.trim()) {
      groups.push([{ text: seg.text.trim(), startMs: Math.round((seg.startSec + offsetSec) * 1000), endMs: Math.round((seg.endSec + offsetSec) * 1000), confidence: null }]);
    }
  }
  return groups.map((words, i) => {
    const low = words.some((w) => w.confidence !== null && w.confidence < LOW_CONFIDENCE);
    return lyricLineSchema.parse({
      id: `asr${i + 1}`,
      text: words.map((w) => w.text).join(' '),
      stanza: 0,
      startMs: words[0]!.startMs,
      endMs: Math.max(words[words.length - 1]!.endMs, words[0]!.startMs + 1),
      status: low ? 'LOW_CONFIDENCE' : 'SUGGESTED',
      source: 'aligner',
      words: words.map((w, j) => ({ id: `asr${i + 1}-w${j + 1}`, text: w.text, startMs: w.startMs, endMs: w.endMs, confidence: w.confidence })),
    });
  });
}
