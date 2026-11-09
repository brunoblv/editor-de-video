/**
 * Compilador único timeline → plano de render (§8: "Prévia e render final
 * consomem o mesmo documento e compilador"). O plano é neutro de fornecedor;
 * adaptadores (FFmpeg, Hyperframes) o executam. Diferenças permitidas entre
 * prévia e final ficam restritas a `quality`: resolução, bitrate e uso de
 * proxy — nunca decisões editoriais.
 */
import { createHash } from 'node:crypto';
import type { TimelineDocument } from './schema.js';
import { timelineRate } from './schema.js';
import { toSeconds } from './time.js';
import { effectiveTextStyle, effectiveTransform, resolveVariant } from './variants.js';
import type { TextStyle, Transform } from './schema.js';

export type RenderQuality = 'preview' | 'final';

export type PlannedVideoLayer = {
  itemId: string;
  trackOrder: number;
  kind: 'clip' | 'composition';
  assetId?: string;
  /** Usar proxy só na prévia; o final sempre usa o original (RF-05). */
  useProxy: boolean;
  startSec: number;
  endSec: number;
  sourceInSec?: number;
  sourceOutSec?: number;
  speed: number;
  transform: Transform;
  templateId?: string;
  templateVersion?: number;
  params?: Record<string, unknown>;
  /** Composição: segundos do início da composição cortados pelo trecho (range). */
  compositionInSec?: number;
  /** Composição: duração total do item, para quem renderiza a composição inteira. */
  compositionDurationSec?: number;
};

export type PlannedAudio = {
  itemId: string;
  assetId: string;
  useProxy: boolean;
  startSec: number;
  endSec: number;
  sourceInSec: number;
  sourceOutSec: number;
  speed: number;
  gainDb: number;
  fadeInSec: number;
  fadeOutSec: number;
  pan: number;
};

export type PlannedText = {
  itemId: string;
  kind: 'text' | 'caption';
  text: string;
  language: string;
  startSec: number;
  endSec: number;
  style: Partial<TextStyle>;
};

/** Linha de letra para a composição (trilha 'lyrics'); frames relativos ao início do plano. */
export type PlannedLyricLine = {
  itemId: string;
  text: string;
  startFrame: number;
  endFrame: number;
  status: string;
  /** null = modo linha (sem tempo por palavra). */
  words: Array<{ text: string; startFrame: number; endFrame: number }> | null;
};

export type RenderRange = { startFrame: number; endFrame: number };

export type RenderPlan = {
  /** Hash do documento + variante: identifica exatamente o que foi renderizado. */
  planHash: string;
  projectId: string;
  revisionId: string;
  variantId: string;
  quality: RenderQuality;
  /** Fator aplicado sobre o quadro da variante (prévia < 1); tamanhos de texto escalam junto. */
  renderScale: number;
  width: number;
  height: number;
  fps: { num: number; den: number };
  durationSec: number;
  durationFrames: number;
  video: PlannedVideoLayer[];
  audio: PlannedAudio[];
  text: PlannedText[];
  lyrics: PlannedLyricLine[];
  /** Trecho da timeline renderizado (prévia segmentada); null = tudo. */
  range: RenderRange | null;
  output: TimelineDocument['output'];
};

export type CompileOptions = {
  variantId?: string | null;
  quality: RenderQuality;
  /** Fator de escala da prévia (ex.: 0.5); o final é sempre 1. */
  previewScale?: number;
  /** Renderiza só [startFrame, endFrame) da timeline, com tempos relativos ao trecho. */
  range?: RenderRange | null;
};

/** Serialização estável (chaves ordenadas) para hashes reprodutíveis. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** Hash editorial: ignora identificação/origem, só o conteúdo que afeta a imagem/som. */
export function editorialHash(doc: TimelineDocument): string {
  const { revisionId: _r, parentRevisionId: _p, origin: _o, ...content } = doc;
  return createHash('sha256').update(stableStringify(content)).digest('hex');
}

export function compileTimeline(doc: TimelineDocument, options: CompileOptions): RenderPlan {
  const fps = timelineRate(doc);
  const variant = resolveVariant(doc, options.variantId);
  const scale = options.quality === 'preview' ? (options.previewScale ?? 0.5) : 1;
  const even = (v: number) => Math.max(2, Math.round((v * scale) / 2) * 2);
  const useProxy = options.quality === 'preview';
  const sec = (frames: number) => toSeconds(frames, fps);

  const total = doc.video.durationFrames;
  const range = options.range ?? null;
  if (range && (range.startFrame < 0 || range.endFrame <= range.startFrame || range.startFrame >= total)) {
    throw new Error(`Trecho inválido: ${range.startFrame}–${range.endFrame} (timeline com ${total} frames)`);
  }
  const rs = range?.startFrame ?? 0;
  const re = range ? Math.min(range.endFrame, total) : total;

  const video: PlannedVideoLayer[] = [];
  const audio: PlannedAudio[] = [];
  const text: PlannedText[] = [];
  const lyrics: PlannedLyricLine[] = [];

  const tracks = [...doc.tracks].sort((a, b) => a.order - b.order);
  for (const track of tracks) {
    for (const item of [...track.items].sort((a, b) => a.timelineStart - b.timelineStart)) {
      // Recorte no trecho, em frames (um único arredondamento ao converter para segundos).
      const s0 = Math.max(item.timelineStart, rs);
      const e0 = Math.min(item.timelineStart + item.duration, re);
      if (e0 <= s0) continue;
      const head = s0 - item.timelineStart;
      const startSec = sec(s0 - rs);
      const endSec = sec(e0 - rs);

      if (item.kind === 'clip') {
        const asset = doc.assets[item.assetId]!;
        const speed = item.playbackRate.num / item.playbackRate.den;
        const isStill = asset.kind === 'image';
        const sourceInSec = isStill ? 0 : toSeconds(item.sourceIn, asset.sourceTimebase) + sec(head) * speed;
        const whole = head === 0 && e0 === item.timelineStart + item.duration;
        const sourceOutSec = isStill ? endSec - startSec : whole ? toSeconds(item.sourceOut, asset.sourceTimebase) : sourceInSec + (endSec - startSec) * speed;
        if (track.type === 'video') {
          video.push({
            itemId: item.id,
            trackOrder: track.order,
            kind: 'clip',
            assetId: item.assetId,
            useProxy,
            startSec,
            endSec,
            sourceInSec,
            sourceOutSec,
            speed,
            transform: effectiveTransform(doc, item, variant.id)!,
          });
        }
        // Áudio do clipe: trilhas de áudio sempre; vídeo com áudio também.
        const wantsAudio = track.type === 'audio' || (track.type === 'video' && asset.hasAudio);
        if (wantsAudio && !track.muted && !isStill) {
          audio.push({
            itemId: item.id,
            assetId: item.assetId,
            useProxy,
            startSec,
            endSec,
            sourceInSec,
            sourceOutSec,
            speed,
            gainDb: item.audio.gainDb,
            // Fades só valem se a borda correspondente do item está dentro do trecho.
            fadeInSec: head === 0 ? sec(item.audio.fadeInFrames) : 0,
            fadeOutSec: e0 === item.timelineStart + item.duration ? sec(item.audio.fadeOutFrames) : 0,
            pan: item.audio.pan,
          });
        }
      } else if (item.kind === 'composition') {
        video.push({
          itemId: item.id,
          trackOrder: track.order,
          kind: 'composition',
          useProxy: false,
          startSec,
          endSec,
          speed: 1,
          transform: effectiveTransform(doc, item, variant.id)!,
          templateId: item.templateId,
          templateVersion: item.templateVersion,
          params: item.params,
          compositionInSec: sec(head),
          compositionDurationSec: sec(item.duration),
        });
      } else if (track.role === 'lyrics' && item.kind === 'caption') {
        // A letra é desenhada pela composição, não queimada como legenda.
        if (track.muted) continue;
        lyrics.push({
          itemId: item.id,
          text: item.text,
          startFrame: s0 - rs,
          endFrame: e0 - rs,
          status: item.lyric?.status ?? 'SUGGESTED',
          words:
            item.words.length > 0 && head === 0 && e0 === item.timelineStart + item.duration
              ? item.words.map((w) => ({ text: w.text, startFrame: w.start - rs, endFrame: w.end - rs }))
              : item.words.length > 0
                ? item.words
                    .filter((w) => w.end > s0 && w.start < e0)
                    .map((w) => ({ text: w.text, startFrame: Math.max(w.start, s0) - rs, endFrame: Math.min(w.end, e0) - rs }))
                : null,
        });
      } else if (!track.muted) {
        text.push({
          itemId: item.id,
          kind: item.kind,
          text: item.text,
          language: item.language,
          startSec,
          endSec,
          style: effectiveTextStyle(doc, item, variant.id),
        });
      }
    }
  }

  const planHash = createHash('sha256')
    .update(editorialHash(doc))
    .update(`|${variant.id}`)
    .update(range ? `|${rs}-${re}` : '')
    .digest('hex');

  return {
    planHash,
    projectId: doc.projectId,
    revisionId: doc.revisionId,
    variantId: variant.id,
    quality: options.quality,
    renderScale: scale,
    width: even(variant.width),
    height: even(variant.height),
    fps,
    durationSec: sec(re - rs),
    durationFrames: re - rs,
    video,
    audio,
    text,
    lyrics,
    range: range ? { startFrame: rs, endFrame: re } : null,
    output: doc.output,
  };
}

/**
 * Compara dois planos ignorando o que pode legitimamente variar entre prévia
 * e final. Retorna as diferenças editoriais (deve ser vazio).
 */
export function editorialDifferences(a: RenderPlan, b: RenderPlan): string[] {
  const strip = (p: RenderPlan) => ({
    revisionId: p.revisionId,
    variantId: p.variantId,
    durationFrames: p.durationFrames,
    video: p.video.map(({ useProxy: _u, ...rest }) => rest),
    audio: p.audio.map(({ useProxy: _u, ...rest }) => rest),
    text: p.text,
    lyrics: p.lyrics,
    range: p.range,
  });
  const sa = strip(a);
  const sb = strip(b);
  const diffs: string[] = [];
  for (const key of Object.keys(sa) as (keyof typeof sa)[]) {
    if (stableStringify(sa[key]) !== stableStringify(sb[key])) diffs.push(key);
  }
  return diffs;
}
