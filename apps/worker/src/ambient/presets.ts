/**
 * Compat: presets legados apontam para o catálogo Midnight.
 * Preferir getMidnightRecipe / MIDNIGHT_RECIPES.
 */
import {
  getMidnightRecipe,
  MIDNIGHT_RECIPES,
  type AmbientPurpose,
  type MidnightRecipeDefinition,
} from '@editor-video/core';
import type { AmbientConcept } from '@editor-video/core';

export type AmbientPresetId = string;

export type AmbientPreset = {
  id: string;
  label: string;
  concept: Omit<AmbientConcept, 'durationMinutes'> & { durationMinutes?: number };
  layerVolumes: Record<string, number>;
  events: Array<{
    type: string;
    minInterval: number;
    maxInterval: number;
    probability: number;
  }>;
  masterProfile: AmbientPurpose;
};

function toPreset(recipe: MidnightRecipeDefinition): AmbientPreset {
  return {
    id: recipe.id,
    label: recipe.name,
    concept: {
      title: recipe.experience,
      environment: recipe.environment,
      weather: recipe.weather,
      time: recipe.time,
      purpose: recipe.purpose,
      durationMinutes: recipe.defaultDurationsMin[0] ?? 60,
      audioLayers: recipe.audioLayers,
      visualQueries: recipe.visualQueries,
      format: 'youtube',
      universe: recipe.universe,
      recipeId: recipe.id,
      seriesId: recipe.seriesId,
      seriesEpisode: recipe.episode,
      playlists: recipe.playlists,
      thumbnailStyle: recipe.thumbnailStyle,
      mainSound: recipe.mainSound,
      experience: recipe.experience,
    },
    layerVolumes: recipe.layerVolumes,
    events: recipe.events,
    masterProfile: recipe.masterProfile,
  };
}

export const AMBIENT_PRESETS: Record<string, AmbientPreset> = Object.fromEntries(
  MIDNIGHT_RECIPES.map((r) => [r.id, toPreset(r)]),
);

/** Presets da Fase 1 (legado). */
export const PHASE1_PRESETS: AmbientPresetId[] = [
  'RAINY_CABIN',
  'COZY_FIREPLACE',
  'FOREST_THUNDERSTORM',
  'RAIN_ON_WINDOW',
];

export function getPreset(id: string | null | undefined): AmbientPreset {
  const recipe = getMidnightRecipe(id);
  return toPreset(recipe);
}
