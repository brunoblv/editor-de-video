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
  output: TimelineDocument['output'];
};

export type CompileOptions = {
  variantId?: string | null;
  quality: RenderQuality;
  /** Fator de escala da prévia (ex.: 0.5); o final é sempre 1. */
  previewScale?: number;
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

  const video: PlannedVideoLayer[] = [];
  const audio: PlannedAudio[] = [];
  const text: PlannedText[] = [];

  const tracks = [...doc.tracks].sort((a, b) => a.order - b.order);
  for (const track of tracks) {
    for (const item of [...track.items].sort((a, b) => a.timelineStart - b.timelineStart)) {
      const startSec = sec(item.timelineStart);
      const endSec = sec(item.timelineStart + item.duration);

      if (item.kind === 'clip') {
        const asset = doc.assets[item.assetId]!;
        const speed = item.playbackRate.num / item.playbackRate.den;
        const isStill = asset.kind === 'image';
        const sourceInSec = isStill ? 0 : toSeconds(item.sourceIn, asset.sourceTimebase);
        const sourceOutSec = isStill ? endSec - startSec : toSeconds(item.sourceOut, asset.sourceTimebase);
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
            fadeInSec: sec(item.audio.fadeInFrames),
            fadeOutSec: sec(item.audio.fadeOutFrames),
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
    durationSec: sec(doc.video.durationFrames),
    durationFrames: doc.video.durationFrames,
    video,
    audio,
    text,
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
  });
  const sa = strip(a);
  const sb = strip(b);
  const diffs: string[] = [];
  for (const key of Object.keys(sa) as (keyof typeof sa)[]) {
    if (stableStringify(sa[key]) !== stableStringify(sb[key])) diffs.push(key);
  }
  return diffs;
}
