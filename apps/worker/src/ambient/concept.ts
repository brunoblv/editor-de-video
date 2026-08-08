import { config, type AmbientConcept, type AmbientPurpose } from '@editor-video/core';
import { createRng, randInt } from './rng.js';
import { AMBIENT_PRESETS, getPreset, type AmbientPresetId } from './presets.js';

const AUTO_COMBOS: Array<{
  environment: string;
  weather: string;
  time: string;
  purpose: AmbientPurpose;
  audioLayers: string[];
  visualQueries: string[];
  title: string;
  presetId: AmbientPresetId;
}> = [
  {
    title: 'Rainy Cabin in the Forest',
    environment: 'cabin',
    weather: 'heavy_rain',
    time: 'night',
    purpose: 'sleep',
    audioLayers: ['rain', 'roof_rain', 'wind', 'distant_thunder', 'fireplace'],
    visualQueries: ['cozy cabin rain night', 'rain window cabin', 'fireplace cabin'],
    presetId: 'RAIN_SLEEP',
  },
  {
    title: 'Forest Night Ambience',
    environment: 'forest',
    weather: 'rain',
    time: 'night',
    purpose: 'sleep',
    audioLayers: ['forest', 'rain', 'wind', 'distant_thunder'],
    visualQueries: ['dark forest night rain', 'forest canopy rain night', 'rainy forest path night'],
    presetId: 'FOREST_NIGHT',
  },
  {
    title: 'Ocean Waves for Sleep',
    environment: 'ocean',
    weather: 'clear',
    time: 'night',
    purpose: 'sleep',
    audioLayers: ['ocean', 'wind'],
    visualQueries: ['ocean waves night calm', 'beach waves moonlight'],
    presetId: 'OCEAN_SLEEP',
  },
  {
    title: 'Soft Rain on the Window',
    environment: 'room',
    weather: 'rain',
    time: 'night',
    purpose: 'sleep',
    audioLayers: ['rain', 'room_ambience', 'wind'],
    visualQueries: ['rain on window night', 'bedroom window rain dark'],
    presetId: 'RAIN_SLEEP',
  },
  {
    title: 'Thunderstorm Over the Cabin',
    environment: 'cabin',
    weather: 'thunderstorm',
    time: 'night',
    purpose: 'immersive',
    audioLayers: ['rain', 'roof_rain', 'wind', 'distant_thunder'],
    visualQueries: ['thunderstorm cabin night', 'heavy rain lightning window'],
    presetId: 'THUNDERSTORM',
  },
  {
    title: 'Fireplace and Gentle Rain',
    environment: 'cabin',
    weather: 'rain',
    time: 'night',
    purpose: 'relax',
    audioLayers: ['rain', 'fireplace', 'wind'],
    visualQueries: ['fireplace rain cabin', 'cozy fire rainy night'],
    presetId: 'COZY_FIREPLACE',
  },
];

export type AmbientCreateInput = {
  title?: string;
  environment?: string;
  weather?: string;
  timeOfDay?: string;
  purpose?: AmbientPurpose;
  durationMinutes?: number;
  preset?: string | null;
  autoConcept?: boolean;
  audioLayers?: string[];
  visualQueries?: string[];
  format?: 'youtube' | 'shorts';
  seed?: number;
};

export function buildConcept(input: AmbientCreateInput): {
  concept: AmbientConcept;
  presetId: AmbientPresetId | null;
  seed: number;
} {
  const seed = input.seed ?? Math.floor(Math.random() * 1_000_000);
  const durationMinutes =
    input.durationMinutes ?? config.ambient.defaultDurationMinutes;

  if (input.autoConcept || (!input.preset && !input.environment && !input.weather)) {
    const rng = createRng(seed);
    const combo = AUTO_COMBOS[randInt(rng, 0, AUTO_COMBOS.length - 1)]!;
    return {
      concept: {
        title: input.title?.trim() || combo.title,
        environment: combo.environment,
        weather: combo.weather,
        time: combo.time,
        purpose: combo.purpose,
        durationMinutes,
        audioLayers: combo.audioLayers,
        visualQueries: combo.visualQueries,
        format: input.format ?? 'youtube',
      },
      presetId: combo.presetId,
      seed,
    };
  }

  if (input.preset) {
    const preset = getPreset(input.preset);
    const environment = input.environment?.trim() || preset.concept.environment;
    const weather = input.weather?.trim() || preset.concept.weather;
    const time = input.timeOfDay?.trim() || preset.concept.time;
    const customized =
      environment !== preset.concept.environment ||
      weather !== preset.concept.weather ||
      time !== preset.concept.time;

    const audioLayers =
      input.audioLayers && input.audioLayers.length > 0
        ? input.audioLayers
        : customized
          ? defaultLayersFor(weather, environment)
          : preset.concept.audioLayers;

    const visualQueries =
      input.visualQueries && input.visualQueries.length > 0
        ? input.visualQueries
        : customized
          ? defaultVisualQueries(environment, weather, time)
          : preset.concept.visualQueries;

    const title =
      input.title?.trim() ||
      (customized
        ? defaultTitle(weather, environment, time)
        : preset.concept.title);

    return {
      concept: {
        ...preset.concept,
        title,
        environment,
        weather,
        time,
        durationMinutes,
        purpose: input.purpose ?? preset.concept.purpose,
        format: input.format ?? preset.concept.format ?? 'youtube',
        audioLayers,
        visualQueries,
      },
      // Se o usuário mudou o ambiente, o preset efetivo acompanha o conceito real.
      presetId: customized ? guessPreset(weather, environment) : preset.id,
      seed,
    };
  }

  const environment = input.environment?.trim() || 'cabin';
  const weather = input.weather?.trim() || 'rain';
  const time = input.timeOfDay?.trim() || 'night';
  const purpose = input.purpose ?? (config.ambient.defaultPurpose as AmbientPurpose);
  const audioLayers =
    input.audioLayers && input.audioLayers.length > 0
      ? input.audioLayers
      : defaultLayersFor(weather, environment);
  const visualQueries =
    input.visualQueries && input.visualQueries.length > 0
      ? input.visualQueries
      : defaultVisualQueries(environment, weather, time);

  const title = input.title?.trim() || defaultTitle(weather, environment, time);

  return {
    concept: {
      title,
      environment,
      weather,
      time,
      purpose,
      durationMinutes,
      audioLayers,
      visualQueries,
      format: input.format ?? 'youtube',
    },
    presetId: guessPreset(weather, environment),
    seed,
  };
}

export function defaultLayersFor(weather: string, environment: string): string[] {
  if (environment === 'ocean') {
    return weather.includes('rain') || weather.includes('storm')
      ? ['ocean', 'rain', 'wind']
      : ['ocean', 'wind'];
  }
  if (environment === 'forest') {
    const layers = new Set<string>(['forest', 'wind']);
    if (weather !== 'clear') layers.add('rain');
    if (weather.includes('thunder') || weather.includes('heavy')) {
      layers.add('distant_thunder');
    }
    return [...layers];
  }
  if (environment === 'cafe') {
    return ['rain', 'room_ambience', 'city_rain'];
  }
  if (environment === 'city') {
    return weather.includes('rain') || weather.includes('storm')
      ? ['city_rain', 'rain', 'wind']
      : ['city_rain', 'wind'];
  }
  if (environment === 'room') {
    return weather === 'clear'
      ? ['room_ambience', 'brown_noise']
      : ['rain', 'room_ambience', 'wind'];
  }

  // cabin / default
  const layers = new Set<string>();
  if (weather === 'clear') {
    layers.add('fireplace');
    layers.add('room_ambience');
    return [...layers];
  }
  layers.add('rain');
  layers.add('roof_rain');
  layers.add('wind');
  if (weather.includes('thunder') || weather.includes('heavy')) {
    layers.add('distant_thunder');
  }
  if (environment === 'cabin') layers.add('fireplace');
  return [...layers];
}

export function defaultVisualQueries(
  environment: string,
  weather: string,
  time: string,
): string[] {
  const weatherLabel = weather.replace(/_/g, ' ');
  const byEnv: Record<string, string[]> = {
    forest: [
      `dark forest ${weatherLabel} ${time}`,
      `forest canopy ${weatherLabel} ${time}`,
      `rainy forest path ${time}`,
    ],
    ocean: [
      `ocean waves ${time} calm`,
      `beach waves moonlight`,
      `sea shore ${weatherLabel} ${time}`,
    ],
    cafe: [
      `rainy cafe window ${time}`,
      `coffee shop rain window`,
      `cafe interior rainy day`,
    ],
    city: [
      `city street ${weatherLabel} ${time}`,
      `urban rain window night`,
      `city lights rain ${time}`,
    ],
    room: [
      `bedroom window ${weatherLabel} ${time}`,
      `rain on window ${time} cozy`,
      `dark room rainy window`,
    ],
    cabin: [
      `cozy cabin ${weatherLabel} ${time}`,
      `rain window cabin ${time}`,
      `cabin interior fireplace ${time}`,
    ],
  };

  return (
    byEnv[environment] ?? [
      `${environment} ${weatherLabel} ${time}`,
      `${weatherLabel} ${environment} atmosphere ${time}`,
    ]
  );
}

export function guessPreset(weather: string, environment: string): AmbientPresetId {
  if (environment === 'forest') return 'FOREST_NIGHT';
  if (environment === 'ocean') return 'OCEAN_SLEEP';
  if (environment === 'cafe') return 'RAINY_CAFE';
  if (weather.includes('thunder')) return 'THUNDERSTORM';
  if (environment === 'cabin' && !weather.includes('rain') && !weather.includes('storm')) {
    return 'COZY_FIREPLACE';
  }
  if (environment === 'cabin' && weather.includes('rain')) return 'RAIN_SLEEP';
  if (Object.prototype.hasOwnProperty.call(AMBIENT_PRESETS, 'COZY_FIREPLACE') && weather === 'clear') {
    return 'COZY_FIREPLACE';
  }
  return 'RAIN_SLEEP';
}

function defaultTitle(weather: string, environment: string, time: string): string {
  return `${capitalize(weather.replace(/_/g, ' '))} ${capitalize(environment)} · ${capitalize(time)}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
