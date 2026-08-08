import type { AmbientConcept, AmbientAudioTimeline, AmbientVisualTimeline } from '@editor-video/core';

export type AmbientMetadata = {
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  attributions: string[];
};

export function buildMetadata(opts: {
  concept: AmbientConcept;
  audioTimeline: AmbientAudioTimeline;
  visualTimeline: AmbientVisualTimeline;
  attributions?: string[];
}): AmbientMetadata {
  const hours = opts.concept.durationMinutes / 60;
  const durationLabel =
    hours >= 1
      ? `${Number.isInteger(hours) ? hours : hours.toFixed(1)} Hour${hours === 1 ? '' : 's'}`
      : `${opts.concept.durationMinutes} Minutes`;

  const title = `${opts.concept.title} | ${durationLabel} ${purposeLabel(opts.concept.purpose)} Sounds`;

  const attributions = opts.attributions ?? collectAttributions(opts.visualTimeline);
  const tags = [
    opts.concept.environment,
    opts.concept.weather.replace(/_/g, ' '),
    opts.concept.purpose,
    'ambient',
    'relaxing sounds',
    'sleep sounds',
    ...opts.concept.audioLayers.map((l) => l.replace(/_/g, ' ')),
  ];

  const uniqueTags = [...new Set(tags.map((t) => t.toLowerCase()))];

  const description = [
    opts.concept.title,
    '',
    `${durationLabel} of carefully layered ambient soundscape for ${opts.concept.purpose}.`,
    `Environment: ${opts.concept.environment} · Weather: ${opts.concept.weather.replace(/_/g, ' ')} · Time: ${opts.concept.time}`,
    '',
    `Layers: ${opts.audioTimeline.layers.map((l) => l.kind.replace(/_/g, ' ')).join(', ')}`,
    '',
    attributions.length
      ? `Credits / Attributions:\n${attributions.map((a) => `- ${a}`).join('\n')}`
      : 'Audio layers synthesized locally. Visual stock credited when applicable.',
    '',
    uniqueTags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' '),
  ].join('\n');

  return {
    title: title.slice(0, 100),
    description,
    tags: uniqueTags,
    hashtags: uniqueTags.map((t) => `#${t.replace(/\s+/g, '')}`),
    attributions,
  };
}

function purposeLabel(purpose: string): string {
  switch (purpose) {
    case 'sleep':
      return 'Sleep';
    case 'study':
      return 'Focus';
    case 'immersive':
      return 'Immersive';
    default:
      return 'Relaxing';
  }
}

function collectAttributions(visual: AmbientVisualTimeline): string[] {
  const items: string[] = [];
  for (const clip of visual.clips) {
    if (clip.provider && clip.sourceUrl) {
      items.push(`${clip.provider}: ${clip.sourceUrl}`);
    }
  }
  return items;
}
