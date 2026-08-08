import {
  buildMidnightTitle,
  config,
  getMidnightRecipe,
  getMidnightVariation,
  resolveEvents,
  resolveLayerVolumes,
  type AmbientConcept,
  type AmbientPurpose,
  type MidnightRecipeDefinition,
  type MidnightVariation,
} from '@editor-video/core';
import { createRng, randInt } from './rng.js';

export type AmbientCreateInput = {
  title?: string;
  environment?: string;
  weather?: string;
  timeOfDay?: string;
  purpose?: AmbientPurpose;
  durationMinutes?: number;
  /** Recipe Midnight ou preset legado. */
  recipeId?: string | null;
  preset?: string | null;
  variationId?: string | null;
  autoConcept?: boolean;
  audioLayers?: string[];
  visualQueries?: string[];
  format?: 'youtube' | 'shorts';
  seed?: number;
};

export type BuiltAmbientConcept = {
  concept: AmbientConcept;
  recipe: MidnightRecipeDefinition;
  variation: MidnightVariation;
  recipeId: string;
  variationId: string;
  layerVolumes: Record<string, number>;
  events: ReturnType<typeof resolveEvents>;
  seed: number;
  /** Compat com código legado. */
  presetId: string;
};

const AUTO_RECIPE_IDS = [
  'RAINY_CABIN',
  'FOREST_THUNDERSTORM',
  'MIDNIGHT_OCEAN',
  'RAIN_ON_WINDOW',
  'COZY_FIREPLACE',
  'MIDNIGHT_FOREST',
  'RAINY_COFFEE_SHOP',
  'WINTER_CABIN',
  'MIDNIGHT_TRAIN',
  'NIGHT_MOUNTAIN',
] as const;

export function buildConcept(input: AmbientCreateInput): BuiltAmbientConcept {
  const seed = input.seed ?? Math.floor(Math.random() * 1_000_000);
  const rng = createRng(seed);
  const durationMinutes =
    input.durationMinutes ?? config.ambient.defaultDurationMinutes;

  let recipeId =
    input.recipeId?.trim() ||
    input.preset?.trim() ||
    null;

  if (input.autoConcept && !recipeId) {
    recipeId = AUTO_RECIPE_IDS[randInt(rng, 0, AUTO_RECIPE_IDS.length - 1)]!;
  }

  const recipe = getMidnightRecipe(recipeId);
  const variation = getMidnightVariation(recipe, input.variationId);
  const layerVolumes = resolveLayerVolumes(recipe, variation);
  const events = resolveEvents(recipe, variation);

  const purpose = input.purpose ?? variation.purpose ?? recipe.purpose;
  const audioLayers =
    input.audioLayers && input.audioLayers.length > 0
      ? input.audioLayers
      : recipe.audioLayers;
  const visualQueries =
    input.visualQueries && input.visualQueries.length > 0
      ? input.visualQueries
      : recipe.visualQueries;

  const title =
    input.title?.trim() && input.title.trim().length >= 3
      ? input.title.trim()
      : buildMidnightTitle({ recipe, variation, durationMinutes });

  const concept: AmbientConcept = {
    title,
    environment: input.environment ?? recipe.environment,
    weather: input.weather ?? recipe.weather,
    time: input.timeOfDay ?? recipe.time,
    purpose,
    durationMinutes,
    audioLayers,
    visualQueries,
    format: input.format ?? 'youtube',
    universe: recipe.universe,
    recipeId: recipe.id,
    variationId: variation.id,
    seriesId: recipe.seriesId,
    seriesEpisode: recipe.episode,
    playlists: recipe.playlists,
    thumbnailStyle: recipe.thumbnailStyle,
    mainSound: recipe.mainSound,
    benefit: variation.benefit,
    experience: recipe.experience,
  };

  return {
    concept,
    recipe,
    variation,
    recipeId: recipe.id,
    variationId: variation.id,
    layerVolumes,
    events,
    seed,
    presetId: recipe.id,
  };
}

/** Helpers usados por soundscape legado. */
export function defaultLayersForEnvironment(environment: string): string[] {
  return getMidnightRecipe(
    environment === 'ocean'
      ? 'MIDNIGHT_OCEAN'
      : environment === 'forest'
        ? 'MIDNIGHT_FOREST'
        : environment === 'cafe'
          ? 'RAINY_COFFEE_SHOP'
          : environment === 'train'
            ? 'MIDNIGHT_TRAIN'
            : environment === 'mountain'
              ? 'NIGHT_MOUNTAIN'
              : 'RAINY_CABIN',
  ).audioLayers;
}
