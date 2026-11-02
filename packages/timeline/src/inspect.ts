/**
 * Utilitários de leitura: criação de timeline vazia, mapeamento de tempo
 * entre original/edição/legendas e resumo de diferenças entre revisões.
 */
import {
  TIMELINE_SCHEMA_VERSION,
  timelineRate,
  timelineSchema,
  type Origin,
  type TimelineDocument,
  type TimelineItem,
} from './schema.js';
import { rescale } from './time.js';
import { itemEnd } from './validate.js';

export type NewTimelineInput = {
  projectId: string;
  revisionId: string;
  width: number;
  height: number;
  fpsNumerator?: number;
  fpsDenominator?: number;
  origin?: Partial<Origin>;
  loudnessProfile?: TimelineDocument['output']['loudnessProfile'];
  brandKitVersionId?: string | null;
  templateVersionId?: string | null;
};

/** Timeline inicial com as quatro trilhas padrão do estúdio. */
export function createTimeline(input: NewTimelineInput): TimelineDocument {
  return timelineSchema.parse({
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    projectId: input.projectId,
    revisionId: input.revisionId,
    parentRevisionId: null,
    video: {
      width: input.width,
      height: input.height,
      fpsNumerator: input.fpsNumerator ?? 30,
      fpsDenominator: input.fpsDenominator ?? 1,
      durationFrames: 0,
    },
    refs: {
      brandKitVersionId: input.brandKitVersionId ?? null,
      templateVersionId: input.templateVersionId ?? null,
    },
    assets: {},
    tracks: [
      { id: 'V1', type: 'video', name: 'Vídeo', order: 0 },
      { id: 'A1', type: 'audio', name: 'Áudio', order: 1 },
      { id: 'T1', type: 'text', name: 'Texto', order: 2 },
      { id: 'C1', type: 'caption', name: 'Legendas', order: 3 },
    ],
    origin: { author: 'system', ...input.origin },
    output: { loudnessProfile: input.loudnessProfile ?? 'speech' },
  });
}

export type SourceHit = { itemId: string; trackId: string; assetId: string; sourceUnits: number };

/** Edição → original: o que está tocando num frame da timeline. */
export function timelineToSource(doc: TimelineDocument, frame: number): SourceHit[] {
  const fps = timelineRate(doc);
  const hits: SourceHit[] = [];
  for (const track of doc.tracks) {
    for (const item of track.items) {
      if (item.kind !== 'clip' || frame < item.timelineStart || frame >= itemEnd(item)) continue;
      const asset = doc.assets[item.assetId];
      if (!asset) continue;
      const effective = {
        num: asset.sourceTimebase.num * item.playbackRate.num,
        den: asset.sourceTimebase.den * item.playbackRate.den,
      };
      hits.push({
        itemId: item.id,
        trackId: track.id,
        assetId: item.assetId,
        sourceUnits: item.sourceIn + rescale(frame - item.timelineStart, fps, effective),
      });
    }
  }
  return hits;
}

/**
 * Original → edição: em quais frames da timeline aparece um instante da
 * fonte. Usado para "clicar na frase navega ao instante" (transcrição é
 * sempre do original). Vazio se o trecho foi cortado.
 */
export function sourceToTimeline(doc: TimelineDocument, assetId: string, sourceUnits: number): number[] {
  const fps = timelineRate(doc);
  const frames: number[] = [];
  for (const track of doc.tracks) {
    for (const item of track.items) {
      if (item.kind !== 'clip' || item.assetId !== assetId) continue;
      if (sourceUnits < item.sourceIn || sourceUnits >= item.sourceOut) continue;
      const asset = doc.assets[assetId]!;
      const effective = {
        num: asset.sourceTimebase.num * item.playbackRate.num,
        den: asset.sourceTimebase.den * item.playbackRate.den,
      };
      frames.push(item.timelineStart + rescale(sourceUnits - item.sourceIn, effective, fps));
    }
  }
  return frames.sort((a, b) => a - b);
}

export type RevisionChange =
  | { type: 'added'; itemId: string; trackId: string; kind: TimelineItem['kind'] }
  | { type: 'removed'; itemId: string; trackId: string; kind: TimelineItem['kind'] }
  | { type: 'modified'; itemId: string; trackId: string; fields: string[] }
  | { type: 'track'; trackId: string; fields: string[] }
  | { type: 'variant'; variantId: string };

/** Resumo legível das diferenças entre duas revisões (comparação/alterações propostas). */
export function diffRevisions(before: TimelineDocument, after: TimelineDocument): RevisionChange[] {
  const index = (doc: TimelineDocument) => {
    const map = new Map<string, { trackId: string; item: TimelineItem }>();
    for (const track of doc.tracks) for (const item of track.items) map.set(item.id, { trackId: track.id, item });
    return map;
  };
  const a = index(before);
  const b = index(after);
  const changes: RevisionChange[] = [];

  for (const [itemId, { trackId, item }] of a) {
    if (!b.has(itemId)) changes.push({ type: 'removed', itemId, trackId, kind: item.kind });
  }
  for (const [itemId, { trackId, item }] of b) {
    const prev = a.get(itemId);
    if (!prev) {
      changes.push({ type: 'added', itemId, trackId, kind: item.kind });
      continue;
    }
    const fields: string[] = [];
    if (prev.trackId !== trackId) fields.push('track');
    const keys = new Set([...Object.keys(prev.item), ...Object.keys(item)]);
    for (const key of keys) {
      const pv = (prev.item as Record<string, unknown>)[key];
      const nv = (item as Record<string, unknown>)[key];
      if (JSON.stringify(pv) !== JSON.stringify(nv)) fields.push(key);
    }
    if (fields.length > 0) changes.push({ type: 'modified', itemId, trackId, fields });
  }

  for (const track of after.tracks) {
    const prev = before.tracks.find((t) => t.id === track.id);
    if (!prev) continue;
    const fields = (['muted', 'locked', 'order'] as const).filter((k) => prev[k] !== track[k]);
    if (fields.length > 0) changes.push({ type: 'track', trackId: track.id, fields: [...fields] });
  }

  const variantKey = (doc: TimelineDocument) => new Map(doc.variants.map((v) => [v.id, JSON.stringify(v)]));
  const va = variantKey(before);
  for (const [variantId, value] of variantKey(after)) {
    if (va.get(variantId) !== value) changes.push({ type: 'variant', variantId });
  }
  return changes;
}

/** Visão compacta para o contexto do agente (sem despejar o JSON inteiro). */
export function summarizeTimeline(doc: TimelineDocument): string {
  const fps = timelineRate(doc);
  const s = (f: number) => (f * fps.den / fps.num).toFixed(2);
  const lines = [
    `Revisão ${doc.revisionId} — ${doc.video.width}x${doc.video.height} @ ${fps.num}/${fps.den} fps — ${s(doc.video.durationFrames)}s (${doc.video.durationFrames} frames)`,
  ];
  for (const track of [...doc.tracks].sort((x, y) => x.order - y.order)) {
    lines.push(`Trilha ${track.id} [${track.type}]${track.locked ? ' BLOQUEADA' : ''}${track.muted ? ' muda' : ''}`);
    for (const item of [...track.items].sort((x, y) => x.timelineStart - y.timelineStart)) {
      const span = `${item.timelineStart}–${itemEnd(item)} (${s(item.timelineStart)}s–${s(itemEnd(item))}s)`;
      const lock = item.locked ? ' BLOQUEADO' : '';
      let detail = '';
      if (item.kind === 'clip') detail = `asset=${item.assetId} src=[${item.sourceIn},${item.sourceOut}) gain=${item.audio.gainDb}dB`;
      if (item.kind === 'text' || item.kind === 'caption') detail = JSON.stringify(item.text.slice(0, 80));
      if (item.kind === 'composition') detail = `template=${item.templateId}@${item.templateVersion}`;
      lines.push(`  - ${item.id} ${item.kind} ${span}${lock} ${detail}`);
    }
  }
  if (doc.variants.length > 0) {
    lines.push(`Variantes: ${doc.variants.map((v) => `${v.id} ${v.width}x${v.height}`).join(', ')}`);
  }
  return lines.join('\n');
}
