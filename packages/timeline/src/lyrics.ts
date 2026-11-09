/**
 * Letra sincronizada na timeline (Reactive Lyrics Studio). Seguro para
 * browser: o estúdio usa as mesmas funções para QA ao vivo.
 *
 * Representação: uma trilha `caption` com `role: 'lyrics'`; cada linha é um
 * item `caption` com `lyric` (estrofe, estado, origem) e palavras em frames
 * absolutos da timeline. Lista de palavras vazia = modo linha (a linha
 * acende inteira; nada de interpolar palavras).
 */
import { parseItem, timelineRate, type CaptionItem, type LyricStatus, type TimelineDocument, type Track } from './schema.js';
import { framesToMs, msToFrames, type Rate } from './time.js';

export const LYRICS_TRACK_ID = 'L1';

/** Linha importada (compatível com `LyricLine` de @editor-video/domain). */
export type ImportedLyricLine = {
  text: string;
  stanza: number;
  startMs: number | null;
  endMs: number | null;
  status: string;
  source: string;
  words: Array<{ text: string; startMs: number | null; endMs: number | null; confidence: number | null }>;
};

export type LyricImportResult = {
  items: CaptionItem[];
  /** Linhas que não couberam no trecho ou ficaram sem tempo útil. */
  skipped: Array<{ text: string; reason: string }>;
};

/**
 * Converte linhas em ms da música para itens da timeline do trecho
 * [segmentStartMs, segmentStartMs + segmentFrames). Tempos são convertidos
 * uma única vez (ms → frame mais próximo).
 *
 * Linhas sem tempo só entram quando a letra inteira está sem tempo (TXT):
 * ficam distribuídas como rascunho com estado UNALIGNED, bloqueando o render
 * final até alguém sincronizar.
 */
export function lyricItemsFromImport(
  lines: ImportedLyricLine[],
  options: { fps: Rate; segmentStartMs: number; segmentFrames: number; offsetMs?: number; idPrefix?: string },
): LyricImportResult {
  const { fps, segmentFrames } = options;
  const prefix = options.idPrefix ?? 'ly';
  const shift = (options.offsetMs ?? 0) - options.segmentStartMs;
  const items: CaptionItem[] = [];
  const skipped: LyricImportResult['skipped'] = [];
  const timed = lines.filter((l) => l.startMs !== null && l.endMs !== null && l.text.trim());

  if (timed.length === 0) {
    const texts = lines.filter((l) => l.text.trim());
    const slot = Math.floor(segmentFrames / Math.max(1, texts.length));
    if (slot < 1) return { items, skipped: texts.map((l) => ({ text: l.text, reason: 'Trecho curto demais para as linhas' })) };
    texts.forEach((line, i) => {
      items.push(
        parseItem({
          id: `${prefix}${i + 1}`,
          kind: 'caption',
          text: line.text,
          timelineStart: i * slot,
          duration: slot,
          words: [],
          lyric: { stanza: line.stanza, status: 'UNALIGNED', source: 'import' },
        }) as CaptionItem,
      );
    });
    return { items, skipped };
  }

  for (const line of lines) {
    if (!line.text.trim()) continue;
    if (line.startMs === null || line.endMs === null) {
      skipped.push({ text: line.text, reason: 'Sem tempo na letra importada' });
      continue;
    }
    const rawStart = msToFrames(line.startMs + shift, fps);
    const rawEnd = msToFrames(line.endMs + shift, fps);
    const start = Math.max(0, rawStart);
    const end = Math.min(segmentFrames, rawEnd);
    if (end <= start) {
      if (rawEnd > 0 && rawStart < segmentFrames) skipped.push({ text: line.text, reason: 'Duração menor que um frame' });
      continue;
    }
    // Palavra mais curta que um frame (comum no alinhador) ganha 1 frame, sem passar do fim da linha.
    const words = line.words.map((w) => {
      if (w.startMs === null || w.endMs === null) return null;
      const ws = Math.min(msToFrames(w.startMs + shift, fps), end - 1);
      return { text: w.text, start: ws, end: Math.min(end, Math.max(ws + 1, msToFrames(w.endMs + shift, fps))), confidence: w.confidence };
    });
    // Só usa tempo por palavra se todas as palavras têm tempo dentro da linha (cortada no trecho).
    const allTimed = words.length > 0 && words.every((w) => w !== null && w.start >= start && w.end <= end && w.end > w.start);
    const status = (['UNALIGNED', 'SUGGESTED', 'LOW_CONFIDENCE'] as const).find((s) => s === line.status) ?? 'SUGGESTED';
    items.push(
      parseItem({
        id: `${prefix}${items.length + 1}`,
        kind: 'caption',
        text: line.text,
        timelineStart: start,
        duration: end - start,
        words: allTimed
          ? words.map((w) => ({ text: w!.text, start: w!.start, end: w!.end, ...(w!.confidence !== null ? { confidence: w!.confidence } : {}) }))
          : [],
        lyric: { stanza: line.stanza, status, source: line.source === 'manual' ? 'manual' : line.source === 'aligner' || line.source === 'asr' ? 'asr' : 'import' },
      }) as CaptionItem,
    );
  }
  return { items, skipped };
}

export function lyricsTrack(doc: TimelineDocument): Track | null {
  return doc.tracks.find((t) => t.role === 'lyrics') ?? null;
}

export function lyricLines(doc: TimelineDocument): CaptionItem[] {
  const track = lyricsTrack(doc);
  if (!track) return [];
  return track.items
    .filter((i): i is CaptionItem => i.kind === 'caption' && Boolean(i.lyric))
    .sort((a, b) => a.timelineStart - b.timelineStart);
}

export type LyricTimelineIssue = {
  itemId: string;
  severity: 'error' | 'warning';
  code: 'UNALIGNED' | 'BEYOND_AUDIO' | 'LINE_OVERLAP' | 'NOT_VALIDATED' | 'LOW_CONFIDENCE' | 'WORD_OVERLAP';
  message: string;
};

const LOW_CONFIDENCE = 0.6;

/**
 * QA da letra na timeline. Erros bloqueiam o render final; avisos aparecem
 * na revisão. `range` (frames) limita a checagem ao trecho renderizado.
 */
export function lyricIssuesInTimeline(doc: TimelineDocument, range?: { startFrame: number; endFrame: number }): LyricTimelineIssue[] {
  const issues: LyricTimelineIssue[] = [];
  const audioEnd = Math.max(
    0,
    ...doc.tracks.filter((t) => t.type === 'audio' && !t.muted).flatMap((t) => t.items.map((i) => i.timelineStart + i.duration)),
  );
  let previous: CaptionItem | null = null;
  for (const line of lyricLines(doc)) {
    const end = line.timelineStart + line.duration;
    if (range && (end <= range.startFrame || line.timelineStart >= range.endFrame)) continue;
    const label = `"${line.text.slice(0, 40)}"`;
    if (line.lyric!.status === 'UNALIGNED') {
      issues.push({ itemId: line.id, severity: 'error', code: 'UNALIGNED', message: `${label} ainda não foi sincronizada` });
    } else if (line.lyric!.status !== 'VALIDATED') {
      issues.push({ itemId: line.id, severity: 'warning', code: 'NOT_VALIDATED', message: `${label} ainda não foi validada` });
    }
    if (end > audioEnd) issues.push({ itemId: line.id, severity: 'error', code: 'BEYOND_AUDIO', message: `${label} termina depois do áudio` });
    if (previous && line.timelineStart < previous.timelineStart + previous.duration) {
      issues.push({ itemId: line.id, severity: 'warning', code: 'LINE_OVERLAP', message: `${label} sobrepõe a linha anterior (canto sobreposto?)` });
    }
    let prevEnd = -1;
    for (const w of line.words) {
      if (w.start < prevEnd) issues.push({ itemId: line.id, severity: 'warning', code: 'WORD_OVERLAP', message: `"${w.text}" sobrepõe a palavra anterior` });
      if (w.confidence !== undefined && w.confidence < LOW_CONFIDENCE) {
        issues.push({ itemId: line.id, severity: 'warning', code: 'LOW_CONFIDENCE', message: `"${w.text}" com confiança ${w.confidence.toFixed(2)}` });
      }
      prevEnd = w.end;
    }
    previous = line;
  }
  return issues;
}

export function lyricStatusCounts(doc: TimelineDocument): Record<LyricStatus, number> {
  const counts: Record<LyricStatus, number> = { UNALIGNED: 0, SUGGESTED: 0, LOW_CONFIDENCE: 0, VALIDATED: 0 };
  for (const line of lyricLines(doc)) counts[line.lyric!.status] += 1;
  return counts;
}

/** Tempo de uma linha em ms (exibição/edição no estúdio). */
export function lyricLineMs(doc: TimelineDocument, line: CaptionItem) {
  const fps = timelineRate(doc);
  return {
    startMs: framesToMs(line.timelineStart, fps),
    endMs: framesToMs(line.timelineStart + line.duration, fps),
    words: line.words.map((w) => ({ text: w.text, startMs: framesToMs(w.start, fps), endMs: framesToMs(w.end, fps) })),
  };
}
