import { Prisma } from '@prisma/client';
import {
  MIDNIGHT_PIPELINE_VERSION,
  MIDNIGHT_RECIPES,
  MIDNIGHT_RECIPE_VERSION,
  type MidnightRecipeDefinition,
} from '@editor-video/core';
import { prisma } from '@editor-video/db';

export const PIPELINE_VERSION = MIDNIGHT_PIPELINE_VERSION;
export const RECIPE_VERSION = MIDNIGHT_RECIPE_VERSION;

function definitionJson(recipe: MidnightRecipeDefinition): Prisma.InputJsonValue {
  return {
    brand: 'Midnight Relaxing Sounds',
    universe: recipe.universe,
    pillar: recipe.pillar,
    seriesId: recipe.seriesId,
    episode: recipe.episode,
    experience: recipe.experience,
    mainSound: recipe.mainSound,
    concept: {
      title: recipe.experience,
      environment: recipe.environment,
      weather: recipe.weather,
      time: recipe.time,
      purpose: recipe.purpose,
      audioLayers: recipe.audioLayers,
      visualQueries: recipe.visualQueries,
      format: 'youtube',
    },
    audio: {
      layers: recipe.layerVolumes,
      events: recipe.events,
    },
    visual: {
      queries: recipe.visualQueries,
      effects: recipe.visualEffects,
    },
    master: { profile: recipe.masterProfile },
    playlists: recipe.playlists,
    titleTemplate: recipe.titleTemplate,
    thumbnailStyle: recipe.thumbnailStyle,
    variations: recipe.variations,
    defaultDurationsMin: recipe.defaultDurationsMin,
  } as unknown as Prisma.InputJsonValue;
}

/** Garante Recipe/RecipeVersion Midnight (v2) no banco a partir do catálogo. */
export async function ensureRecipesSeeded(): Promise<void> {
  for (const recipe of MIDNIGHT_RECIPES) {
    await prisma.recipe.upsert({
      where: { id: recipe.id },
      create: {
        id: recipe.id,
        name: recipe.name,
        description: recipe.experience,
        universe: recipe.universe,
        pillar: recipe.pillar,
        seriesId: recipe.seriesId,
        episode: recipe.episode,
      },
      update: {
        name: recipe.name,
        description: recipe.experience,
        universe: recipe.universe,
        pillar: recipe.pillar,
        seriesId: recipe.seriesId,
        episode: recipe.episode,
      },
    });

    const existing = await prisma.recipeVersion.findUnique({
      where: {
        recipeId_version: { recipeId: recipe.id, version: RECIPE_VERSION },
      },
    });

    if (!existing) {
      await prisma.recipeVersion.create({
        data: {
          recipeId: recipe.id,
          version: RECIPE_VERSION,
          pipelineVersion: PIPELINE_VERSION,
          definitionJson: definitionJson(recipe),
        },
      });
    } else {
      await prisma.recipeVersion.update({
        where: { id: existing.id },
        data: {
          pipelineVersion: PIPELINE_VERSION,
          definitionJson: definitionJson(recipe),
        },
      });
    }
  }
}

export async function loadRecipeVersion(recipeId: string, version = RECIPE_VERSION) {
  return prisma.recipeVersion.findUnique({
    where: { recipeId_version: { recipeId, version } },
    include: { recipe: true },
  });
}
