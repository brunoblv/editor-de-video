/**
 * Barrel Node completo (`config`/`storage`/`queue` + midnight/types).
 * No browser, o package.json resolve para `browser.js` (sem APIs Node).
 * Client Components preferem `@editor-video/core/midnight` ou `/render`.
 * Código server-only pode usar `@editor-video/core/server` para deixar a intenção explícita.
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
  COUNTDOWN_DURATION_FRAMES,
  INTRO_DURATION_FRAMES,
  OUTRO_DURATION_FRAMES,
  christianDurationInFrames,
  curiosidadeDurationInFrames,
  totalDurationInFrames,
  type AmbientAudioLayer,
  type AmbientAudioTimeline,
  type AmbientConcept,
  type AmbientLayerType,
  type AmbientPurpose,
  type AmbientSoundEvent,
  type AmbientVisualTimeline,
  type CaptionSegment,
  type CaptionWord,
  type CharacterState,
  type ChristianProps,
  type ChristianScene,
  type CuriosidadeProps,
  type CuriosidadeScene,
  type ProjectKindValue,
  type ProjectStatusValue,
  type RenderClip,
  type TopListProps,
} from './types.js';
export {
  RENDER_QUEUE,
  redisConnection,
  type AmbientRenderMode,
  type RenderJobData,
} from './queue.js';
export {
  MIDNIGHT_BRAND,
  MIDNIGHT_TAGLINE,
  MIDNIGHT_SERIES_ID,
  MIDNIGHT_PIPELINE_VERSION,
  MIDNIGHT_RECIPE_VERSION,
  MIDNIGHT_PLAYLISTS,
  MIDNIGHT_UNIVERSES,
  MIDNIGHT_RECIPES,
  LEGACY_PRESET_TO_RECIPE,
  getMidnightRecipe,
  getMidnightVariation,
  resolveLayerVolumes,
  resolveEvents,
  formatDurationLabel,
  buildMidnightTitle,
  buildShortsTitle,
  defaultDurationsForPillar,
  recipesForUniverse,
  type MidnightUniverse,
  type MidnightPillar,
  type MidnightPlaylistKey,
  type MidnightVariationId,
  type MidnightRecipeDefinition,
  type MidnightVariation,
  type MidnightRecipeEvent,
  type MidnightRecipeId,
} from './midnight.js';
