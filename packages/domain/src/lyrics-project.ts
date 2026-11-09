/**
 * Montagem da timeline de um projeto Reactive Lyrics. Usada pelo serviço do
 * hub e pelo script de linha de comando, para que os dois renderizem a mesma
 * estrutura: música em A1, composição `reactive-lyrics` em V1 e letra em L1.
 */
import {
  framesToMs,
  LYRICS_TRACK_ID,
  lyricItemsFromImport,
  msToFrames,
  parseItem,
  rescale,
  timelineRate,
  MS_RATE,
  type AssetRef,
  type ImportedLyricLine,
  type LyricImportResult,
  type TimelineDocument,
} from '@editor-video/timeline';
import { LYRICS_PRESETS, type LyricsPresetId } from './reactive.js';

export const LYRICS_TEMPLATE = { slug: 'reactive-lyrics', version: 1 } as const;
export const LYRICS_COMPOSITION_ITEM_ID = 'lyrics-fx';
export const LYRICS_AUDIO_ITEM_ID = 'song';

export const LYRICS_LIMITS = {
  maxAudioSec: Number(process.env.LYRICS_MAX_AUDIO_SEC ?? 600),
  maxAudioBytes: Number(process.env.LYRICS_MAX_AUDIO_MB ?? 200) * 1024 * 1024,
  audioExtensions: ['.mp3', '.wav', '.flac'],
  lyricsExtensions: ['.txt', '.lrc', '.srt', '.vtt'],
  maxLyricsBytes: 256 * 1024,
} as const;

export function defaultLyricsParams(presetId: LyricsPresetId, extra: { credit?: string } = {}): Record<string, unknown> {
  const preset = LYRICS_PRESETS[presetId];
  return { preset: preset.templatePreset, ...preset.palette, ...(extra.credit ? { credit: extra.credit.slice(0, 80) } : {}) };
}

export type SeedLyricsInput = {
  audio: AssetRef;
  /** Trecho da música, em ms. */
  segmentStartMs: number;
  segmentDurationMs: number;
  lines: ImportedLyricLine[];
  /** Deslocamento importado da letra (ex.: [offset] do LRC). */
  offsetMs?: number;
  presetId: LyricsPresetId;
  credit?: string;
};

export type SeedLyricsResult = LyricImportResult & { doc: TimelineDocument; segmentFrames: number };

/** Preenche um documento recém-criado (trilhas padrão V1/A1/T1/C1) com o projeto Lyrics. */
export function seedLyricsTimeline(base: TimelineDocument, input: SeedLyricsInput): SeedLyricsResult {
  const doc = structuredClone(base);
  const fps = timelineRate(doc);
  const audio = input.audio;
  if (audio.kind !== 'audio') throw new Error('O projeto Lyrics precisa de um asset de áudio.');
  const total = audio.durationUnits ?? 0;
  const sourceIn = rescale(Math.max(0, Math.round(input.segmentStartMs)), MS_RATE, audio.sourceTimebase);
  if (total <= 0 || sourceIn >= total) throw new Error('O trecho começa depois do fim da música.');
  // Frames do trecho, sem ultrapassar o fim do arquivo.
  let segmentFrames = msToFrames(input.segmentDurationMs, fps);
  while (segmentFrames > 0 && sourceIn + rescale(segmentFrames, fps, audio.sourceTimebase) > total) segmentFrames -= 1;
  if (segmentFrames <= 0) throw new Error('Trecho vazio.');
  const sourceOut = sourceIn + rescale(segmentFrames, fps, audio.sourceTimebase);

  doc.assets[audio.assetId] = audio;
  doc.output = { ...doc.output, loudnessProfile: 'none' };
  doc.tracks.find((t) => t.id === 'A1')!.items = [
    parseItem({ id: LYRICS_AUDIO_ITEM_ID, kind: 'clip', assetId: audio.assetId, sourceIn, sourceOut, timelineStart: 0, duration: segmentFrames }),
  ];
  doc.tracks.find((t) => t.id === 'V1')!.items = [
    parseItem({
      id: LYRICS_COMPOSITION_ITEM_ID,
      kind: 'composition',
      templateId: LYRICS_TEMPLATE.slug,
      templateVersion: LYRICS_TEMPLATE.version,
      params: defaultLyricsParams(input.presetId, { credit: input.credit }),
      timelineStart: 0,
      duration: segmentFrames,
    }),
  ];
  const imported = lyricItemsFromImport(input.lines, {
    fps,
    // Início exato do trecho, já arredondado para a amostra do áudio.
    segmentStartMs: framesToMs(0, fps) + rescale(sourceIn, audio.sourceTimebase, MS_RATE),
    segmentFrames,
    offsetMs: input.offsetMs ?? 0,
  });
  doc.tracks = doc.tracks.filter((t) => t.role !== 'lyrics');
  doc.tracks.push({ id: LYRICS_TRACK_ID, type: 'caption', role: 'lyrics', name: 'Letra', order: 4, muted: false, locked: false, items: imported.items });
  doc.video.durationFrames = segmentFrames;
  return { ...imported, doc, segmentFrames };
}
