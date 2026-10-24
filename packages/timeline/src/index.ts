/**
 * @editor-video/timeline — documento de edição V3, operações de domínio,
 * patches com concorrência otimista e compilador único de render.
 * Seguro para browser, exceto `./compile` (usa node:crypto).
 */
export * from './time.js';
export {
  TIMELINE_SCHEMA_VERSION,
  TRACK_ACCEPTS,
  assetRefSchema,
  audioSchema,
  captionItemSchema,
  clipItemSchema,
  compositionItemSchema,
  cropSchema,
  itemSchema,
  originSchema,
  outputSchema,
  parseItem,
  parseTimeline,
  textItemSchema,
  textStyleSchema,
  timelineRate,
  timelineSchema,
  trackSchema,
  transformSchema,
  variantSchema,
  type AssetRef,
  type AudioSettings,
  type CaptionItem,
  type ClipItem,
  type CompositionItem,
  type Crop,
  type Origin,
  type TextItem,
  type TextStyle,
  type TimelineDocument,
  type TimelineItem,
  type Track,
  type TrackType,
  type Transform,
  type Variant,
} from './schema.js';
export * from './validate.js';
export * from './operations.js';
export * from './patch.js';
export * from './commands.js';
export * from './variants.js';
export * from './inspect.js';
