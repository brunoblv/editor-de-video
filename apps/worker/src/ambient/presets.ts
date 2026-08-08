import type { AmbientConcept, AmbientPurpose } from '@editor-video/core';

export type AmbientPresetId =
  | 'RAIN_SLEEP'
  | 'COZY_FIREPLACE'
  | 'FOREST_NIGHT'
  | 'OCEAN_SLEEP'
  | 'RAINY_CAFE'
  | 'THUNDERSTORM'
  | 'BROWN_NOISE';

export type AmbientPreset = {
  id: AmbientPresetId;
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

export const AMBIENT_PRESETS: Record<AmbientPresetId, AmbientPreset> = {
  RAIN_SLEEP: {
    id: 'RAIN_SLEEP',
    label: 'Chuva para dormir',
    concept: {
      title: 'Rainy Cabin at Night',
      environment: 'cabin',
      weather: 'heavy_rain',
      time: 'night',
      purpose: 'sleep',
      durationMinutes: 60,
      audioLayers: ['rain', 'roof_rain', 'wind', 'distant_thunder', 'fireplace'],
      visualQueries: ['cozy cabin rain night', 'rain window cabin', 'fireplace cabin night'],
      format: 'youtube',
    },
    layerVolumes: {
      rain: 0.45,
      roof_rain: 0.2,
      fireplace: 0.15,
      wind: 0.08,
      distant_thunder: 0.12,
    },
    events: [
      { type: 'thunder', minInterval: 45, maxInterval: 240, probability: 0.65 },
      { type: 'wind_gust', minInterval: 30, maxInterval: 120, probability: 0.55 },
      { type: 'wood_crack', minInterval: 60, maxInterval: 180, probability: 0.4 },
    ],
    masterProfile: 'sleep',
  },
  COZY_FIREPLACE: {
    id: 'COZY_FIREPLACE',
    label: 'Lareira aconchegante',
    concept: {
      title: 'Cozy Fireplace Evening',
      environment: 'cabin',
      weather: 'clear',
      time: 'night',
      purpose: 'relax',
      durationMinutes: 60,
      audioLayers: ['fireplace', 'room_ambience', 'wood_crack'],
      visualQueries: ['cozy fireplace night', 'cabin fireplace warm light'],
      format: 'youtube',
    },
    layerVolumes: { fireplace: 0.55, room_ambience: 0.25, wood_crack: 0.2 },
    events: [{ type: 'wood_crack', minInterval: 20, maxInterval: 90, probability: 0.7 }],
    masterProfile: 'relax',
  },
  FOREST_NIGHT: {
    id: 'FOREST_NIGHT',
    label: 'Floresta à noite',
    concept: {
      title: 'Forest Night Ambience',
      environment: 'forest',
      weather: 'rain',
      time: 'night',
      purpose: 'sleep',
      durationMinutes: 60,
      audioLayers: ['forest', 'rain', 'wind', 'distant_thunder'],
      visualQueries: [
        'dark forest night rain',
        'forest canopy rain night',
        'rainy forest path night',
      ],
      format: 'youtube',
    },
    layerVolumes: { forest: 0.35, rain: 0.35, wind: 0.15, distant_thunder: 0.15 },
    events: [
      { type: 'thunder', minInterval: 90, maxInterval: 300, probability: 0.4 },
      { type: 'wind_gust', minInterval: 40, maxInterval: 140, probability: 0.5 },
    ],
    masterProfile: 'sleep',
  },
  OCEAN_SLEEP: {
    id: 'OCEAN_SLEEP',
    label: 'Oceano para dormir',
    concept: {
      title: 'Ocean Waves for Sleep',
      environment: 'ocean',
      weather: 'clear',
      time: 'night',
      purpose: 'sleep',
      durationMinutes: 60,
      audioLayers: ['ocean', 'wind'],
      visualQueries: ['ocean waves night calm', 'beach waves moonlight'],
      format: 'youtube',
    },
    layerVolumes: { ocean: 0.75, wind: 0.25 },
    events: [{ type: 'wind_gust', minInterval: 50, maxInterval: 160, probability: 0.35 }],
    masterProfile: 'sleep',
  },
  RAINY_CAFE: {
    id: 'RAINY_CAFE',
    label: 'Café chuvoso',
    concept: {
      title: 'Rainy Cafe Ambience',
      environment: 'cafe',
      weather: 'rain',
      time: 'day',
      purpose: 'study',
      durationMinutes: 60,
      audioLayers: ['rain', 'room_ambience', 'city_rain'],
      visualQueries: ['rainy cafe window', 'coffee shop rain window day'],
      format: 'youtube',
    },
    layerVolumes: { rain: 0.4, room_ambience: 0.35, city_rain: 0.25 },
    events: [],
    masterProfile: 'study',
  },
  THUNDERSTORM: {
    id: 'THUNDERSTORM',
    label: 'Tempestade',
    concept: {
      title: 'Thunderstorm Night',
      environment: 'cabin',
      weather: 'thunderstorm',
      time: 'night',
      purpose: 'immersive',
      durationMinutes: 60,
      audioLayers: ['rain', 'roof_rain', 'wind', 'distant_thunder'],
      visualQueries: ['thunderstorm night window', 'heavy rain lightning night'],
      format: 'youtube',
    },
    layerVolumes: {
      rain: 0.4,
      roof_rain: 0.2,
      wind: 0.15,
      distant_thunder: 0.25,
    },
    events: [
      { type: 'thunder', minInterval: 25, maxInterval: 120, probability: 0.85 },
      { type: 'wind_gust', minInterval: 20, maxInterval: 80, probability: 0.7 },
    ],
    masterProfile: 'immersive',
  },
  BROWN_NOISE: {
    id: 'BROWN_NOISE',
    label: 'Brown noise',
    concept: {
      title: 'Deep Brown Noise',
      environment: 'room',
      weather: 'clear',
      time: 'night',
      purpose: 'sleep',
      durationMinutes: 60,
      audioLayers: ['brown_noise'],
      visualQueries: ['soft abstract dark gradient calm'],
      format: 'youtube',
    },
    layerVolumes: { brown_noise: 1 },
    events: [],
    masterProfile: 'sleep',
  },
};

/** Presets da Fase 1 (Rain Engine). */
export const PHASE1_PRESETS: AmbientPresetId[] = [
  'RAIN_SLEEP',
  'COZY_FIREPLACE',
  'THUNDERSTORM',
  'BROWN_NOISE',
];

export function getPreset(id: string | null | undefined): AmbientPreset {
  if (id && id in AMBIENT_PRESETS) {
    return AMBIENT_PRESETS[id as AmbientPresetId];
  }
  return AMBIENT_PRESETS.RAIN_SLEEP;
}
