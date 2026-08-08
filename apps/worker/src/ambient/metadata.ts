import type {
  AmbientConcept,
  AmbientAudioTimeline,
  AmbientVisualTimeline,
} from '@editor-video/core';
import {
  MIDNIGHT_BRAND,
  MIDNIGHT_TAGLINE,
  buildShortsTitle,
  formatDurationLabel,
  getMidnightRecipe,
  getMidnightVariation,
} from '@editor-video/core';

export type AmbientMetadata = {
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  attributions: string[];
  playlists: string[];
  series?: string;
  episode?: number;
  shortsTitle?: string;
  shortsDescription?: string;
};

export function buildMetadata(opts: {
  concept: AmbientConcept;
  audioTimeline: AmbientAudioTimeline;
  visualTimeline: AmbientVisualTimeline;
  attributions?: string[];
}): AmbientMetadata {
  const recipe = getMidnightRecipe(opts.concept.recipeId ?? opts.concept.environment);
  const variation = getMidnightVariation(recipe, opts.concept.variationId);
  const durationLabel = formatDurationLabel(opts.concept.durationMinutes);
  const isShorts = opts.concept.format === 'shorts';

  const experience = opts.concept.experience ?? recipe.experience;
  const mainSound = opts.concept.mainSound ?? recipe.mainSound;
  const benefit = opts.concept.benefit ?? variation.benefit;

  const longTitle =
    opts.concept.title?.trim() ||
    `${experience} — ${mainSound} for ${benefit} | ${durationLabel}`;

  const title = (isShorts
    ? buildShortsTitle({ recipe, variation })
    : longTitle
  ).slice(0, 100);

  const attributions = [
    ...new Set([
      ...(opts.attributions ?? []),
      ...collectAttributions(opts.audioTimeline, opts.visualTimeline),
    ]),
  ];

  const playlists = opts.concept.playlists ?? recipe.playlists;

  const tags = [
    MIDNIGHT_BRAND.toLowerCase(),
    'midnight relaxing sounds',
    recipe.universe,
    recipe.pillar,
    benefit.toLowerCase(),
    opts.concept.environment,
    opts.concept.weather.replace(/_/g, ' '),
    opts.concept.purpose,
    'ambient soundscape',
    'sleep sounds',
    'relaxing sounds',
    ...opts.concept.audioLayers.map((l) => l.replace(/_/g, ' ')),
    ...playlists.map((p) => p.replace(/_/g, ' ')),
  ];

  const uniqueTags = [...new Set(tags.map((t) => t.toLowerCase()))].slice(0, 40);

  const seriesLine =
    opts.concept.seriesId && opts.concept.seriesEpisode
      ? `${opts.concept.seriesId.replace(/_/g, ' ')} · Episode ${String(opts.concept.seriesEpisode).padStart(2, '0')} — ${recipe.name}`
      : null;

  const shortsDescription = [
    `POV: You're settling into ${experience.toLowerCase()}…`,
    '',
    `Full ${durationLabel.toLowerCase()} version on ${MIDNIGHT_BRAND}.`,
    MIDNIGHT_TAGLINE,
    '',
    uniqueTags.slice(0, 8).map((t) => `#${t.replace(/\s+/g, '')}`).join(' '),
  ].join('\n');

  const description = isShorts
    ? shortsDescription
    : [
        experience,
        seriesLine,
        '',
        `${durationLabel} of cinematic nighttime soundscape — ${mainSound} for ${benefit}.`,
        MIDNIGHT_TAGLINE,
        '',
        `Universe: ${recipe.universe} · Pillar: ${recipe.pillar} · Weather: ${opts.concept.weather.replace(/_/g, ' ')}`,
        `Layers: ${opts.audioTimeline.layers.map((l) => l.kind.replace(/_/g, ' ')).join(', ')}`,
        '',
        playlists.length
          ? `Suggested playlists: ${playlists.map((p) => p.replace(/_/g, ' ')).join(', ')}`
          : null,
        '',
        attributions.length
          ? `Credits / Attributions:\n${attributions.map((a) => `- ${a}`).join('\n')}`
          : 'Audio layers synthesized locally. Visual stock credited when applicable.',
        '',
        `— ${MIDNIGHT_BRAND}`,
        uniqueTags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' '),
      ]
        .filter((line) => line !== null)
        .join('\n');

  return {
    title,
    description,
    tags: uniqueTags,
    hashtags: uniqueTags.map((t) => `#${t.replace(/\s+/g, '')}`),
    attributions,
    playlists,
    series: opts.concept.seriesId,
    episode: opts.concept.seriesEpisode,
    shortsTitle: buildShortsTitle({ recipe, variation }),
    shortsDescription,
  };
}

function collectAttributions(
  audio: AmbientAudioTimeline,
  visual: AmbientVisualTimeline,
): string[] {
  const items: string[] = [];
  for (const layer of audio.layers) {
    if (layer.source === 'library' && layer.assetId) {
      items.push(`Audio library: ${layer.kind} (${layer.assetId})`);
    } else if (layer.source === 'synthetic' || layer.source === 'noise') {
      items.push(`Synthetic audio: ${layer.kind}`);
    }
  }
  for (const clip of visual.clips) {
    if (clip.provider && clip.sourceUrl) {
      const author = clip.author ? ` — ${clip.author}` : '';
      items.push(`${clip.provider}${author}: ${clip.sourceUrl}`);
    }
  }
  return items;
}
