/**
 * Documento de timeline V3 — fonte oficial da edição (§8 da especificação).
 *
 * Convenções:
 * - Tempos da timeline em frames inteiros na taxa `video.fps`.
 * - Tempos de fonte (`sourceIn`/`sourceOut`) em unidades inteiras da
 *   `sourceTimebase` do asset referenciado.
 * - Intervalos [in, out), final exclusivo.
 * - Prévia e render final consomem este mesmo documento (ver compile.ts).
 */
import { z } from 'zod';

export const TIMELINE_SCHEMA_VERSION = 1;

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/, 'ID com caracteres inválidos');
const nonNegInt = z.number().int().nonnegative();
const posInt = z.number().int().positive();

export const rateSchema = z.object({ num: posInt, den: posInt });

export const assetRefSchema = z.object({
  assetId: id,
  /** sha256 do original — garante que a revisão aponta para um arquivo imutável. */
  hash: z.string().min(16),
  kind: z.enum(['video', 'audio', 'image', 'font', 'character', 'composition']),
  /** Unidades por segundo dos tempos de fonte (frames para vídeo, amostras para áudio). */
  sourceTimebase: rateSchema,
  /** Duração em unidades da sourceTimebase; ausente para imagens estáticas. */
  durationUnits: nonNegInt.optional(),
  width: posInt.optional(),
  height: posInt.optional(),
  hasAudio: z.boolean().default(false),
});

export const cropSchema = z.object({
  /** Frações 0–1 do quadro de origem. */
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().gt(0).max(1),
  height: z.number().gt(0).max(1),
});

export const keyframeSchema = z.object({
  frame: nonNegInt,
  property: z.enum(['positionX', 'positionY', 'scale', 'rotation', 'opacity']),
  value: z.number(),
  easing: z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut', 'hold']).default('linear'),
});

export const transformSchema = z.object({
  /** Centro do item, em frações do quadro de saída (0.5/0.5 = centro). */
  positionX: z.number().default(0.5),
  positionY: z.number().default(0.5),
  scale: z.number().positive().default(1),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  crop: cropSchema.nullable().default(null),
  /** fit = cabe inteiro (sem esticar); fill = cobre o quadro cortando o excedente. */
  fit: z.enum(['fit', 'fill']).default('fit'),
  keyframes: z.array(keyframeSchema).default([]),
});

export const audioSchema = z.object({
  gainDb: z.number().min(-60).max(24).default(0),
  fadeInFrames: nonNegInt.default(0),
  fadeOutFrames: nonNegInt.default(0),
  pan: z.number().min(-1).max(1).default(0),
  /** Abaixa esta trilha quando houver fala na trilha indicada. */
  duckUnderTrackId: id.nullable().default(null),
  duckDb: z.number().max(0).default(-12),
});

export const textStyleSchema = z.object({
  fontFamily: z.string().default('Inter'),
  fontAssetId: id.nullable().default(null),
  fontSize: posInt.default(64),
  fontWeight: z.number().int().min(100).max(900).default(700),
  color: z.string().default('#FFFFFF'),
  background: z.string().nullable().default(null),
  align: z.enum(['left', 'center', 'right']).default('center'),
  /** Posição vertical em frações do quadro (0 = topo). */
  positionY: z.number().min(0).max(1).default(0.8),
  /** Margem de área segura em frações do quadro. */
  safeArea: z.number().min(0).max(0.3).default(0.06),
});

const itemBase = {
  id,
  timelineStart: nonNegInt,
  duration: posInt,
  locked: z.boolean().default(false),
};

export const clipItemSchema = z.object({
  ...itemBase,
  kind: z.literal('clip'),
  assetId: id,
  sourceIn: nonNegInt,
  sourceOut: posInt,
  playbackRate: rateSchema.default({ num: 1, den: 1 }),
  transform: transformSchema.prefault({}),
  audio: audioSchema.prefault({}),
});

export const textItemSchema = z.object({
  ...itemBase,
  kind: z.literal('text'),
  text: z.string().max(2000),
  language: z.string().min(2).max(16).default('pt-BR'),
  style: textStyleSchema.prefault({}),
  transform: transformSchema.prefault({}),
});

export const captionWordSchema = z.object({
  text: z.string(),
  start: nonNegInt,
  end: posInt,
});

export const captionItemSchema = z.object({
  ...itemBase,
  kind: z.literal('caption'),
  text: z.string().max(500),
  language: z.string().min(2).max(16).default('pt-BR'),
  /** Origem na transcrição (TranscriptVersion/segmento), para rastrear correções. */
  transcriptRef: z
    .object({ transcriptId: id, segmentIndex: nonNegInt })
    .nullable()
    .default(null),
  words: z.array(captionWordSchema).default([]),
});

export const compositionItemSchema = z.object({
  ...itemBase,
  kind: z.literal('composition'),
  templateId: id,
  templateVersion: posInt,
  /** Parâmetros já validados contra o schema do TemplateVersion. */
  params: z.record(z.string(), z.unknown()).default({}),
  transform: transformSchema.prefault({}),
});

export const itemSchema = z.discriminatedUnion('kind', [
  clipItemSchema,
  textItemSchema,
  captionItemSchema,
  compositionItemSchema,
]);

export const trackSchema = z.object({
  id,
  type: z.enum(['video', 'audio', 'text', 'caption']),
  name: z.string().max(80).optional(),
  order: z.number().int(),
  muted: z.boolean().default(false),
  locked: z.boolean().default(false),
  items: z.array(itemSchema).default([]),
});

/** Variante de formato (RF-13): mesma edição, enquadramento próprio. */
export const variantSchema = z.object({
  id,
  label: z.string().max(40),
  width: posInt,
  height: posInt,
  /** Transformações por item que substituem a principal só nesta variante. */
  transforms: z.record(id, transformSchema).default({}),
  /** Estilo de legenda/texto específico (ex.: subir legenda no 9:16). */
  textStyles: z.record(id, patchShape(textStyleSchema)).default({}),
});

export const originSchema = z.object({
  author: z.enum(['human', 'agent', 'system', 'migration']),
  userId: z.string().nullable().default(null),
  agentRunId: z.string().nullable().default(null),
  command: z.string().max(4000).nullable().default(null),
  planSummary: z.string().max(8000).nullable().default(null),
  restoredFromRevisionId: z.string().nullable().default(null),
});

export const outputSchema = z.object({
  presetVersion: z.string().default('h264-aac-v1'),
  container: z.enum(['mp4']).default('mp4'),
  videoCodec: z.enum(['h264']).default('h264'),
  audioCodec: z.enum(['aac']).default('aac'),
  colorPolicy: z.enum(['bt709']).default('bt709'),
  loudnessProfile: z.enum(['speech', 'music', 'ambient', 'none']).default('speech'),
});

export const timelineSchema = z.object({
  schemaVersion: z.literal(TIMELINE_SCHEMA_VERSION),
  projectId: id,
  revisionId: id,
  parentRevisionId: id.nullable(),
  video: z.object({
    width: posInt,
    height: posInt,
    fpsNumerator: posInt,
    fpsDenominator: posInt,
    durationFrames: nonNegInt,
  }),
  refs: z
    .object({
      brandKitVersionId: id.nullable().default(null),
      templateVersionId: id.nullable().default(null),
    })
    .prefault({}),
  assets: z.record(id, assetRefSchema),
  tracks: z.array(trackSchema),
  variants: z.array(variantSchema).default([]),
  origin: originSchema,
  output: outputSchema.prefault({}),
});

export type AssetRef = z.infer<typeof assetRefSchema>;
export type Crop = z.infer<typeof cropSchema>;
export type Transform = z.infer<typeof transformSchema>;
export type AudioSettings = z.infer<typeof audioSchema>;
export type TextStyle = z.infer<typeof textStyleSchema>;
export type ClipItem = z.infer<typeof clipItemSchema>;
export type TextItem = z.infer<typeof textItemSchema>;
export type CaptionItem = z.infer<typeof captionItemSchema>;
export type CompositionItem = z.infer<typeof compositionItemSchema>;
export type TimelineItem = z.infer<typeof itemSchema>;
export type Track = z.infer<typeof trackSchema>;
export type TrackType = Track['type'];
export type Variant = z.infer<typeof variantSchema>;
export type Origin = z.infer<typeof originSchema>;
export type TimelineDocument = z.infer<typeof timelineSchema>;

/** Tipos de item aceitos por tipo de trilha. */
export const TRACK_ACCEPTS: Record<TrackType, TimelineItem['kind'][]> = {
  video: ['clip', 'composition'],
  audio: ['clip'],
  text: ['text', 'composition'],
  caption: ['caption'],
};

export function timelineRate(doc: Pick<TimelineDocument, 'video'>): z.infer<typeof rateSchema> {
  return { num: doc.video.fpsNumerator, den: doc.video.fpsDenominator };
}

/** Aplica defaults do schema a uma entrada parcial (ex.: vinda da API/agente). */
export function parseTimeline(input: unknown): TimelineDocument {
  return timelineSchema.parse(input);
}

export function parseItem(input: unknown): TimelineItem {
  return itemSchema.parse(input);
}

/**
 * Versão parcial de um objeto SEM aplicar defaults: em atualizações, campo
 * ausente significa "não alterar" (o `.partial()` do zod ainda preenche
 * defaults e sobrescreveria valores existentes).
 */
export function patchShape<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    let inner = field as z.ZodType;
    while (inner instanceof z.ZodDefault || inner instanceof z.ZodPrefault) {
      inner = inner.unwrap() as z.ZodType;
    }
    shape[key] = inner.optional();
  }
  return z.object(shape) as unknown as z.ZodObject<{ [K in keyof T]: z.ZodOptional<T[K]> }>;
}
