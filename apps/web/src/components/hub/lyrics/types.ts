import type { TimelineDocument, TimelineOperation } from '@editor-video/timeline';

export type LyricsBinding = {
  source: 'bass' | 'mids' | 'treble' | 'rms' | 'onset' | 'beat';
  target: 'scale' | 'glow' | 'opacity' | 'translate' | 'particles' | 'glitch' | 'bgZoom' | 'brightness';
  gain: number;
  threshold: number;
  smoothingMs: number;
  cooldownMs: number;
  clampMin: number;
  clampMax: number;
  enabled: boolean;
};

export type LyricsPresetInfo = {
  id: 'CINEMATIC_ATMOSPHERIC_LYRICS' | 'NEON_CINEMATIC' | 'MINIMAL_LYRICS' | 'GLITCH_ROCK';
  name: string;
  templatePreset: 'cinematic' | 'neon' | 'minimal' | 'glitch_rock';
  palette: { accent: string; background: string; textColor: string };
  bindings: LyricsBinding[];
};

export type LyricsIssue = { itemId: string; severity: 'error' | 'warning'; code: string; message: string };

export type LyricsState = {
  lyrics: { id: string; language: string | null; lyricsFormat: string; rightsDeclaredAt: string | null; rightsNote: string | null; musicalMapKey: string | null; analysisVersion: string | null; bpmEstimate: number | null };
  audio: { id: string; originalName: string; storageKey: string; durationSec: number | null; sha256: string | null; license: string | null; author: string | null };
  segment: { itemId: string; timelineStart: number; frames: number; startMs: number; durationMs: number };
  analysis: { ready: boolean; version: string | null; bpm: number | null; job: { id: string; state: string; progress: number; stage: string | null; errorMessage: string | null } | null };
  transcription: { job: { id: string; state: string; progress: number; stage: string | null; errorMessage: string | null } | null; available: boolean; model: string | null; language: string | null };
  issues: LyricsIssue[];
  counts: Record<string, number>;
};

export type LyricsMap = {
  sampleIntervalMs: number;
  offsetMs: number;
  durationMs: number;
  bpm: number | null;
  analysisVersion: string;
  rms: number[];
  bass: number[];
  mids: number[];
  treble: number[];
  beats: number[];
  onsets: Array<{ timeMs: number; strength: number }>;
};

/** Contexto que os painéis do estúdio Lyrics compartilham. */
export type LyricsStudioApi = {
  doc: TimelineDocument;
  apply: (ops: TimelineOperation[], summary: string) => Promise<boolean>;
  playheadMs: number;
  seekMs: (ms: number) => void;
  selected: string | null;
  select: (itemId: string | null) => void;
  loop: { startMs: number; endMs: number } | null;
  setLoop: (loop: { startMs: number; endMs: number } | null) => void;
};

export function formatMs(ms: number): string {
  const sign = ms < 0 ? '-' : '';
  const v = Math.abs(Math.round(ms));
  const m = Math.floor(v / 60000);
  const s = Math.floor((v % 60000) / 1000);
  const r = v % 1000;
  return `${sign}${m}:${String(s).padStart(2, '0')}.${String(r).padStart(3, '0')}`;
}

/** "m:ss.mmm", "ss.mmm" ou ms puros → ms; null se ilegível. */
export function parseMs(text: string): number | null {
  const t = text.trim();
  const m = /^(?:(\d+):)?(\d+)(?:[.,](\d{1,3}))?$/.exec(t);
  if (!m) return null;
  const frac = m[3] ? Number(m[3].padEnd(3, '0')) : 0;
  return (Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000 + frac;
}
