/**
 * APIs Node-only (config, storage, fila).
 * Importar como `@editor-video/core/server` — nunca em Client Components.
 */
export { config, repoRoot, type AppConfig } from './config.js';
export { PILLARS, WEEKDAY_CATEGORIES, findPillar, type Pillar } from './christian.js';
export {
  getStorage,
  storageKeys,
  LocalDiskStorage,
  type Storage,
} from './storage.js';
export {
  RENDER_QUEUE,
  redisConnection,
  type AmbientRenderMode,
  type RenderJobData,
} from './queue.js';
export { CAPTION_STYLES, resolveCaptionStyle, type CaptionStyle } from './types.js';
