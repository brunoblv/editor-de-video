/**
 * Validação semântica do documento (além do schema estrutural): referências,
 * limites de fonte, IDs únicos, intervalos e sobreposição por trilha.
 * Executada antes de todo commit de revisão (§8).
 */
import {
  TRACK_ACCEPTS,
  timelineRate,
  timelineSchema,
  type TimelineDocument,
  type TimelineItem,
  type Track,
} from './schema.js';
import { clipTimelineDuration, overlaps } from './time.js';

export type ValidationIssue = {
  code:
    | 'SCHEMA'
    | 'DUPLICATE_ID'
    | 'UNKNOWN_ASSET'
    | 'ASSET_KIND'
    | 'SOURCE_RANGE'
    | 'DURATION_MISMATCH'
    | 'TRACK_KIND'
    | 'OVERLAP'
    | 'CAPTION_WORDS'
    | 'DURATION_TOTAL'
    | 'VARIANT_REF';
  message: string;
  path?: string;
};

export type ValidationResult = { ok: true } | { ok: false; issues: ValidationIssue[] };

/** Tolerância de arredondamento entre duração declarada e a derivada da fonte. */
const DURATION_TOLERANCE_FRAMES = 1;

export function itemEnd(item: Pick<TimelineItem, 'timelineStart' | 'duration'>): number {
  return item.timelineStart + item.duration;
}

export function computeDurationFrames(tracks: Track[]): number {
  let end = 0;
  for (const track of tracks) {
    for (const item of track.items) end = Math.max(end, itemEnd(item));
  }
  return end;
}

export function validateTimeline(input: unknown): ValidationResult {
  const parsed = timelineSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        code: 'SCHEMA' as const,
        message: issue.message,
        path: issue.path.join('.'),
      })),
    };
  }
  const issues = validateSemantics(parsed.data);
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export function validateSemantics(doc: TimelineDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  const fps = timelineRate(doc);

  const claim = (value: string, path: string) => {
    if (seen.has(value)) {
      issues.push({ code: 'DUPLICATE_ID', message: `ID duplicado: ${value}`, path });
    }
    seen.add(value);
  };

  doc.tracks.forEach((track, ti) => {
    claim(track.id, `tracks.${ti}`);
    const sorted = [...track.items].sort((a, b) => a.timelineStart - b.timelineStart);

    track.items.forEach((item, ii) => {
      const path = `tracks.${ti}.items.${ii}`;
      claim(item.id, path);

      if (!TRACK_ACCEPTS[track.type].includes(item.kind)) {
        issues.push({
          code: 'TRACK_KIND',
          message: `Item ${item.id} (${item.kind}) não pode ficar na trilha ${track.type}`,
          path,
        });
      }

      if (item.kind === 'clip') {
        const asset = doc.assets[item.assetId];
        if (!asset) {
          issues.push({ code: 'UNKNOWN_ASSET', message: `Asset ${item.assetId} não referenciado`, path });
          return;
        }
        if (track.type === 'audio' && asset.kind === 'video' && !asset.hasAudio) {
          issues.push({ code: 'ASSET_KIND', message: `Asset ${item.assetId} não tem áudio`, path });
        }
        if (track.type === 'video' && asset.kind === 'audio') {
          issues.push({ code: 'ASSET_KIND', message: `Asset de áudio ${item.assetId} em trilha de vídeo`, path });
        }
        if (item.sourceIn >= item.sourceOut) {
          issues.push({ code: 'SOURCE_RANGE', message: `sourceIn deve ser menor que sourceOut em ${item.id}`, path });
        }
        if (asset.durationUnits !== undefined && item.sourceOut > asset.durationUnits) {
          issues.push({
            code: 'SOURCE_RANGE',
            message: `Item ${item.id} ultrapassa o fim do asset (${item.sourceOut} > ${asset.durationUnits})`,
            path,
          });
        }
        // Imagens estáticas não têm duração de fonte: a duração é livre.
        if (asset.kind !== 'image' && item.sourceIn < item.sourceOut) {
          const expected = clipTimelineDuration(
            item.sourceIn,
            item.sourceOut,
            asset.sourceTimebase,
            fps,
            item.playbackRate,
          );
          if (Math.abs(expected - item.duration) > DURATION_TOLERANCE_FRAMES) {
            issues.push({
              code: 'DURATION_MISMATCH',
              message: `Duração de ${item.id} (${item.duration}) difere da fonte (${expected})`,
              path,
            });
          }
        }
      }

      if (item.kind === 'caption') {
        for (const word of item.words) {
          if (word.start >= word.end || word.start < item.timelineStart || word.end > itemEnd(item)) {
            issues.push({
              code: 'CAPTION_WORDS',
              message: `Palavra "${word.text}" fora do intervalo da legenda ${item.id}`,
              path,
            });
            break;
          }
        }
      }
    });

    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1]!;
      const curr = sorted[i]!;
      const a = { start: prev.timelineStart, end: itemEnd(prev) };
      const b = { start: curr.timelineStart, end: itemEnd(curr) };
      if (overlaps(a, b)) {
        issues.push({
          code: 'OVERLAP',
          message: `Itens ${prev.id} e ${curr.id} se sobrepõem na trilha ${track.id}`,
          path: `tracks.${ti}`,
        });
      }
    }
  });

  const total = computeDurationFrames(doc.tracks);
  if (doc.video.durationFrames !== total) {
    issues.push({
      code: 'DURATION_TOTAL',
      message: `durationFrames (${doc.video.durationFrames}) difere do fim do último item (${total})`,
    });
  }

  const itemIds = new Set(doc.tracks.flatMap((t) => t.items.map((i) => i.id)));
  doc.variants.forEach((variant, vi) => {
    claim(variant.id, `variants.${vi}`);
    for (const ref of [...Object.keys(variant.transforms), ...Object.keys(variant.textStyles)]) {
      if (!itemIds.has(ref)) {
        issues.push({
          code: 'VARIANT_REF',
          message: `Variante ${variant.id} referencia item inexistente ${ref}`,
          path: `variants.${vi}`,
        });
      }
    }
  });

  return issues;
}
