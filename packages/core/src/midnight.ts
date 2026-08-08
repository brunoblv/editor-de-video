/**
 * Catálogo Midnight Relaxing Sounds — receitas, universos e variações.
 * Compartilhado entre web e worker.
 *
 * Exposto como `@editor-video/core/midnight` para uso em Client Components.
 * Não importar o barrel `@editor-video/core` no browser — ele puxa storage/Node.
 */

import type { AmbientPurpose } from './types.js';

export const MIDNIGHT_BRAND = 'Midnight Relaxing Sounds';
export const MIDNIGHT_TAGLINE = 'Choose where you want to be tonight.';
export const MIDNIGHT_SERIES_ID = 'MIDNIGHT_SERIES';
export const MIDNIGHT_PIPELINE_VERSION = 'ambient-midnight-v1';
export const MIDNIGHT_RECIPE_VERSION = 2;

export type MidnightUniverse =
  | 'cabin'
  | 'forest'
  | 'ocean'
  | 'cafe'
  | 'winter'
  | 'train'
  | 'mountain'
  | 'window'
  | 'fireplace';

export type MidnightPillar = 'sleep' | 'cozy' | 'focus';

export type MidnightPlaylistKey =
  | 'deep_sleep'
  | 'rain'
  | 'cozy_nights'
  | 'nature'
  | 'focus_study'
  | 'ocean'
  | 'thunderstorms';

export const MIDNIGHT_PLAYLISTS: Array<{
  key: MidnightPlaylistKey;
  title: string;
  description: string;
}> = [
  {
    key: 'deep_sleep',
    title: 'Deep Sleep — 6–10h',
    description: 'Long nighttime soundscapes for deep sleep.',
  },
  {
    key: 'rain',
    title: 'Rain Sounds — 1–10h',
    description: 'Rain atmospheres from gentle to heavy.',
  },
  {
    key: 'cozy_nights',
    title: 'Cozy Nights — 1–3h',
    description: 'Cabins, fireplaces and warm midnight spaces.',
  },
  {
    key: 'nature',
    title: 'Nature Sounds — 1–8h',
    description: 'Forests, mountains and natural night ambience.',
  },
  {
    key: 'focus_study',
    title: 'Focus & Study — 1–3h',
    description: 'Calm atmospheres for focus and study.',
  },
  {
    key: 'ocean',
    title: 'Ocean Sounds — 1–8h',
    description: 'Waves and coastal midnight ambience.',
  },
  {
    key: 'thunderstorms',
    title: 'Thunderstorms — 3–10h',
    description: 'Storms and distant thunder for sleep and immersion.',
  },
];

export const MIDNIGHT_UNIVERSES: Array<{
  id: MidnightUniverse;
  label: string;
  blurb: string;
}> = [
  { id: 'cabin', label: 'Midnight Cabin', blurb: 'Cabana sob a chuva e o silêncio da noite.' },
  { id: 'forest', label: 'Midnight Forest', blurb: 'Floresta na madrugada.' },
  { id: 'ocean', label: 'Midnight Ocean', blurb: 'Oceano sob a lua.' },
  { id: 'cafe', label: 'Midnight Café', blurb: 'Café vazio numa noite chuvosa.' },
  { id: 'fireplace', label: 'Cozy Fireplace', blurb: 'Lareira e calor noturno.' },
  { id: 'winter', label: 'Midnight Winter', blurb: 'Casa no inverno, vento e neve.' },
  { id: 'train', label: 'Midnight Train', blurb: 'Trem atravessando a noite.' },
  { id: 'window', label: 'Rain on Window', blurb: 'Chuva suave no vidro.' },
  { id: 'mountain', label: 'Night Mountain', blurb: 'Montanha sob o céu estrelado.' },
];

export type MidnightVariationId =
  | 'deep_sleep'
  | 'study'
  | 'heavy_rain'
  | 'fireplace_focus'
  | 'storm'
  | 'gentle'
  | 'waves'
  | 'wind';

export type MidnightRecipeEvent = {
  type: string;
  minInterval: number;
  maxInterval: number;
  probability: number;
};

export type MidnightVariation = {
  id: MidnightVariationId;
  label: string;
  purpose: AmbientPurpose;
  titleSuffix: string;
  benefit: string;
  layerVolumeOverrides?: Record<string, number>;
  eventOverrides?: MidnightRecipeEvent[];
};

export type MidnightRecipeDefinition = {
  id: string;
  name: string;
  episode: number;
  universe: MidnightUniverse;
  pillar: MidnightPillar;
  seriesId: string;
  experience: string;
  mainSound: string;
  environment: string;
  weather: string;
  time: string;
  purpose: AmbientPurpose;
  audioLayers: string[];
  layerVolumes: Record<string, number>;
  events: MidnightRecipeEvent[];
  visualQueries: string[];
  visualEffects: {
    slowZoom: boolean;
    rainOverlay: boolean;
    lightFlicker: boolean;
  };
  masterProfile: AmbientPurpose;
  playlists: MidnightPlaylistKey[];
  thumbnailStyle: 'cabin' | 'forest' | 'ocean' | 'cafe' | 'fire' | 'winter' | 'train' | 'mountain' | 'window';
  titleTemplate: string;
  variations: MidnightVariation[];
  defaultDurationsMin: number[];
};

const sleepDurations = [60, 180, 480];
const cozyFocusDurations = [60, 120, 180];

export const MIDNIGHT_RECIPES: MidnightRecipeDefinition[] = [
  {
    id: 'RAINY_CABIN',
    name: 'Rainy Cabin',
    episode: 1,
    universe: 'cabin',
    pillar: 'sleep',
    seriesId: MIDNIGHT_SERIES_ID,
    experience: 'Rainy Cabin at Midnight',
    mainSound: 'Heavy Rain & Fireplace',
    environment: 'cabin',
    weather: 'heavy_rain',
    time: 'night',
    purpose: 'sleep',
    audioLayers: ['rain', 'roof_rain', 'wind', 'distant_thunder', 'fireplace'],
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
    visualQueries: [
      'cozy cabin rain night cinematic',
      'rain window cabin fireplace night',
      'wooden cabin thunderstorm night',
    ],
    visualEffects: { slowZoom: true, rainOverlay: true, lightFlicker: true },
    masterProfile: 'sleep',
    playlists: ['deep_sleep', 'rain', 'cozy_nights'],
    thumbnailStyle: 'cabin',
    titleTemplate: '{experience} — {mainSound} for {benefit} | {duration}',
    defaultDurationsMin: sleepDurations,
    variations: [
      {
        id: 'deep_sleep',
        label: 'Deep Sleep',
        purpose: 'sleep',
        titleSuffix: 'Deep Sleep',
        benefit: 'Deep Sleep',
        layerVolumeOverrides: { rain: 0.5, fireplace: 0.12, distant_thunder: 0.1 },
      },
      {
        id: 'study',
        label: 'Study',
        purpose: 'study',
        titleSuffix: 'Study',
        benefit: 'Focus & Study',
        layerVolumeOverrides: { rain: 0.4, fireplace: 0.2, distant_thunder: 0.05, wind: 0.05 },
        eventOverrides: [{ type: 'wood_crack', minInterval: 90, maxInterval: 240, probability: 0.3 }],
      },
      {
        id: 'heavy_rain',
        label: 'Heavy Rain',
        purpose: 'immersive',
        titleSuffix: 'Heavy Rain',
        benefit: 'Immersion',
        layerVolumeOverrides: { rain: 0.55, roof_rain: 0.25, distant_thunder: 0.18, fireplace: 0.08 },
      },
      {
        id: 'fireplace_focus',
        label: 'Fireplace',
        purpose: 'relax',
        titleSuffix: 'Fireplace',
        benefit: 'Relaxation',
        layerVolumeOverrides: { fireplace: 0.35, rain: 0.3, roof_rain: 0.15, wind: 0.05 },
      },
    ],
  },
  {
    id: 'FOREST_THUNDERSTORM',
    name: 'Forest Thunderstorm',
    episode: 2,
    universe: 'forest',
    pillar: 'sleep',
    seriesId: MIDNIGHT_SERIES_ID,
    experience: 'Forest Thunderstorm at Midnight',
    mainSound: 'Rain & Distant Thunder',
    environment: 'forest',
    weather: 'thunderstorm',
    time: 'night',
    purpose: 'sleep',
    audioLayers: ['forest', 'rain', 'wind', 'distant_thunder'],
    layerVolumes: { forest: 0.3, rain: 0.4, wind: 0.15, distant_thunder: 0.2 },
    events: [
      { type: 'thunder', minInterval: 30, maxInterval: 150, probability: 0.8 },
      { type: 'wind_gust', minInterval: 25, maxInterval: 100, probability: 0.65 },
    ],
    visualQueries: [
      'dark forest thunderstorm night cinematic',
      'lightning forest canopy rain night',
      'stormy woods path night',
    ],
    visualEffects: { slowZoom: true, rainOverlay: true, lightFlicker: false },
    masterProfile: 'immersive',
    playlists: ['thunderstorms', 'nature', 'deep_sleep'],
    thumbnailStyle: 'forest',
    titleTemplate: '{experience} — {mainSound} for {benefit} | {duration}',
    defaultDurationsMin: sleepDurations,
    variations: [
      {
        id: 'deep_sleep',
        label: 'Deep Sleep',
        purpose: 'sleep',
        titleSuffix: 'Deep Sleep',
        benefit: 'Deep Sleep',
        layerVolumeOverrides: { distant_thunder: 0.15, rain: 0.4 },
      },
      {
        id: 'storm',
        label: 'Heavy Storm',
        purpose: 'immersive',
        titleSuffix: 'Heavy Storm',
        benefit: 'Immersion',
        layerVolumeOverrides: { distant_thunder: 0.28, rain: 0.45, wind: 0.2 },
      },
      {
        id: 'gentle',
        label: 'Distant Storm',
        purpose: 'relax',
        titleSuffix: 'Distant Storm',
        benefit: 'Relaxation',
        layerVolumeOverrides: { distant_thunder: 0.1, rain: 0.35, forest: 0.35 },
      },
      {
        id: 'study',
        label: 'Focus Rain',
        purpose: 'study',
        titleSuffix: 'Focus',
        benefit: 'Focus & Study',
        layerVolumeOverrides: { distant_thunder: 0.06, rain: 0.4, forest: 0.3 },
        eventOverrides: [{ type: 'thunder', minInterval: 120, maxInterval: 360, probability: 0.35 }],
      },
    ],
  },
  {
    id: 'MIDNIGHT_OCEAN',
    name: 'Midnight Ocean',
    episode: 3,
    universe: 'ocean',
    pillar: 'sleep',
    seriesId: MIDNIGHT_SERIES_ID,
    experience: 'Midnight Ocean Waves',
    mainSound: 'Ocean Waves & Soft Wind',
    environment: 'ocean',
    weather: 'clear',
    time: 'night',
    purpose: 'sleep',
    audioLayers: ['ocean', 'wind', 'soft_foam'],
    layerVolumes: { ocean: 0.7, wind: 0.2, soft_foam: 0.15 },
    events: [{ type: 'wind_gust', minInterval: 50, maxInterval: 160, probability: 0.35 }],
    visualQueries: [
      'ocean waves moonlight night cinematic',
      'calm beach waves under stars',
      'moonlit sea horizon night',
    ],
    visualEffects: { slowZoom: true, rainOverlay: false, lightFlicker: false },
    masterProfile: 'sleep',
    playlists: ['ocean', 'deep_sleep', 'nature'],
    thumbnailStyle: 'ocean',
    titleTemplate: '{experience} — {mainSound} for {benefit} | {duration}',
    defaultDurationsMin: sleepDurations,
    variations: [
      {
        id: 'deep_sleep',
        label: 'Deep Sleep',
        purpose: 'sleep',
        titleSuffix: 'Deep Sleep',
        benefit: 'Deep Sleep',
      },
      {
        id: 'waves',
        label: 'Strong Waves',
        purpose: 'immersive',
        titleSuffix: 'Strong Waves',
        benefit: 'Immersion',
        layerVolumeOverrides: { ocean: 0.85, soft_foam: 0.2 },
      },
      {
        id: 'gentle',
        label: 'Gentle Tide',
        purpose: 'relax',
        titleSuffix: 'Gentle Tide',
        benefit: 'Relaxation',
        layerVolumeOverrides: { ocean: 0.55, wind: 0.15 },
      },
      {
        id: 'study',
        label: 'Focus Waves',
        purpose: 'study',
        titleSuffix: 'Focus',
        benefit: 'Focus & Study',
        layerVolumeOverrides: { ocean: 0.6, wind: 0.12 },
      },
    ],
  },
  {
    id: 'COZY_FIREPLACE',
    name: 'Cozy Fireplace',
    episode: 4,
    universe: 'fireplace',
    pillar: 'cozy',
    seriesId: MIDNIGHT_SERIES_ID,
    experience: 'Cozy Fireplace Night',
    mainSound: 'Fireplace & Soft Ambience',
    environment: 'cabin',
    weather: 'clear',
    time: 'night',
    purpose: 'relax',
    audioLayers: ['fireplace', 'room_ambience', 'wood_crack'],
    layerVolumes: { fireplace: 0.55, room_ambience: 0.25, wood_crack: 0.2 },
    events: [{ type: 'wood_crack', minInterval: 20, maxInterval: 90, probability: 0.7 }],
    visualQueries: [
      'cozy fireplace night cinematic cabin',
      'warm fireplace crackling dark room',
      'cabin fireplace soft glow night',
    ],
    visualEffects: { slowZoom: true, rainOverlay: false, lightFlicker: true },
    masterProfile: 'relax',
    playlists: ['cozy_nights', 'deep_sleep'],
    thumbnailStyle: 'fire',
    titleTemplate: '{experience} — {mainSound} for {benefit} | {duration}',
    defaultDurationsMin: cozyFocusDurations,
    variations: [
      {
        id: 'fireplace_focus',
        label: 'Fireplace',
        purpose: 'relax',
        titleSuffix: 'Fireplace',
        benefit: 'Relaxation',
      },
      {
        id: 'deep_sleep',
        label: 'Sleep Fire',
        purpose: 'sleep',
        titleSuffix: 'Sleep',
        benefit: 'Deep Sleep',
        layerVolumeOverrides: { fireplace: 0.45, room_ambience: 0.2 },
      },
      {
        id: 'gentle',
        label: 'Soft Crackling',
        purpose: 'relax',
        titleSuffix: 'Soft Crackling',
        benefit: 'Relaxation',
        layerVolumeOverrides: { fireplace: 0.4, wood_crack: 0.12 },
      },
      {
        id: 'study',
        label: 'Study Fire',
        purpose: 'study',
        titleSuffix: 'Study',
        benefit: 'Focus & Study',
        layerVolumeOverrides: { fireplace: 0.35, room_ambience: 0.3 },
      },
    ],
  },
  {
    id: 'MIDNIGHT_FOREST',
    name: 'Midnight Forest',
    episode: 5,
    universe: 'forest',
    pillar: 'sleep',
    seriesId: MIDNIGHT_SERIES_ID,
    experience: 'Midnight Forest Ambience',
    mainSound: 'Forest Wind & Crickets',
    environment: 'forest',
    weather: 'clear',
    time: 'night',
    purpose: 'sleep',
    audioLayers: ['forest', 'wind', 'crickets', 'leaves'],
    layerVolumes: { forest: 0.45, wind: 0.2, crickets: 0.2, leaves: 0.15 },
    events: [
      { type: 'wind_gust', minInterval: 40, maxInterval: 140, probability: 0.45 },
      { type: 'owl', minInterval: 90, maxInterval: 300, probability: 0.35 },
    ],
    visualQueries: [
      'dark forest night moonlight cinematic',
      'misty forest path night stars',
      'woods canopy night calm',
    ],
    visualEffects: { slowZoom: true, rainOverlay: false, lightFlicker: false },
    masterProfile: 'sleep',
    playlists: ['nature', 'deep_sleep'],
    thumbnailStyle: 'forest',
    titleTemplate: '{experience} — {mainSound} for {benefit} | {duration}',
    defaultDurationsMin: sleepDurations,
    variations: [
      {
        id: 'deep_sleep',
        label: 'Deep Sleep',
        purpose: 'sleep',
        titleSuffix: 'Deep Sleep',
        benefit: 'Deep Sleep',
      },
      {
        id: 'gentle',
        label: 'Soft Night',
        purpose: 'relax',
        titleSuffix: 'Soft Night',
        benefit: 'Relaxation',
        layerVolumeOverrides: { crickets: 0.12, wind: 0.15 },
      },
      {
        id: 'wind',
        label: 'Windy Woods',
        purpose: 'immersive',
        titleSuffix: 'Windy Woods',
        benefit: 'Immersion',
        layerVolumeOverrides: { wind: 0.35, leaves: 0.25 },
      },
      {
        id: 'study',
        label: 'Focus Forest',
        purpose: 'study',
        titleSuffix: 'Focus',
        benefit: 'Focus & Study',
        layerVolumeOverrides: { crickets: 0.1, forest: 0.5 },
      },
    ],
  },
  {
    id: 'RAINY_COFFEE_SHOP',
    name: 'Rainy Coffee Shop',
    episode: 6,
    universe: 'cafe',
    pillar: 'focus',
    seriesId: MIDNIGHT_SERIES_ID,
    experience: 'Rainy Midnight Café',
    mainSound: 'Rain & Café Ambience',
    environment: 'cafe',
    weather: 'rain',
    time: 'night',
    purpose: 'study',
    audioLayers: ['rain', 'room_ambience', 'city_rain'],
    layerVolumes: { rain: 0.4, room_ambience: 0.35, city_rain: 0.25 },
    events: [],
    visualQueries: [
      'rainy cafe window night cinematic',
      'coffee shop rain window empty night',
      'cafe interior rain glass night warm light',
    ],
    visualEffects: { slowZoom: true, rainOverlay: true, lightFlicker: true },
    masterProfile: 'study',
    playlists: ['focus_study', 'rain', 'cozy_nights'],
    thumbnailStyle: 'cafe',
    titleTemplate: '{experience} — {mainSound} for {benefit} | {duration}',
    defaultDurationsMin: cozyFocusDurations,
    variations: [
      {
        id: 'study',
        label: 'Study',
        purpose: 'study',
        titleSuffix: 'Study',
        benefit: 'Focus & Study',
      },
      {
        id: 'gentle',
        label: 'Soft Rain',
        purpose: 'relax',
        titleSuffix: 'Soft Rain',
        benefit: 'Relaxation',
        layerVolumeOverrides: { rain: 0.3, room_ambience: 0.4 },
      },
      {
        id: 'heavy_rain',
        label: 'Heavy Rain',
        purpose: 'immersive',
        titleSuffix: 'Heavy Rain',
        benefit: 'Immersion',
        layerVolumeOverrides: { rain: 0.5, city_rain: 0.3 },
      },
      {
        id: 'deep_sleep',
        label: 'Night Café Sleep',
        purpose: 'sleep',
        titleSuffix: 'Sleep',
        benefit: 'Deep Sleep',
        layerVolumeOverrides: { room_ambience: 0.25, rain: 0.45 },
      },
    ],
  },
  {
    id: 'WINTER_CABIN',
    name: 'Winter Cabin',
    episode: 7,
    universe: 'winter',
    pillar: 'cozy',
    seriesId: MIDNIGHT_SERIES_ID,
    experience: 'Winter Cabin at Midnight',
    mainSound: 'Fireplace, Wind & Soft Snow',
    environment: 'cabin',
    weather: 'snow',
    time: 'night',
    purpose: 'relax',
    audioLayers: ['fireplace', 'wind', 'snow_wind', 'room_ambience'],
    layerVolumes: { fireplace: 0.4, wind: 0.2, snow_wind: 0.2, room_ambience: 0.2 },
    events: [
      { type: 'wood_crack', minInterval: 30, maxInterval: 120, probability: 0.55 },
      { type: 'wind_gust', minInterval: 40, maxInterval: 140, probability: 0.5 },
    ],
    visualQueries: [
      'snowy cabin night fireplace cinematic',
      'winter cabin window snow night',
      'cozy cabin blizzard outside warm light',
    ],
    visualEffects: { slowZoom: true, rainOverlay: false, lightFlicker: true },
    masterProfile: 'relax',
    playlists: ['cozy_nights', 'nature'],
    thumbnailStyle: 'winter',
    titleTemplate: '{experience} — {mainSound} for {benefit} | {duration}',
    defaultDurationsMin: cozyFocusDurations,
    variations: [
      {
        id: 'fireplace_focus',
        label: 'Fireplace Winter',
        purpose: 'relax',
        titleSuffix: 'Fireplace',
        benefit: 'Relaxation',
      },
      {
        id: 'wind',
        label: 'Blizzard',
        purpose: 'immersive',
        titleSuffix: 'Blizzard',
        benefit: 'Immersion',
        layerVolumeOverrides: { snow_wind: 0.35, wind: 0.3 },
      },
      {
        id: 'deep_sleep',
        label: 'Winter Sleep',
        purpose: 'sleep',
        titleSuffix: 'Sleep',
        benefit: 'Deep Sleep',
      },
      {
        id: 'gentle',
        label: 'Soft Snow',
        purpose: 'relax',
        titleSuffix: 'Soft Snow',
        benefit: 'Relaxation',
        layerVolumeOverrides: { snow_wind: 0.12, fireplace: 0.45 },
      },
    ],
  },
  {
    id: 'MIDNIGHT_TRAIN',
    name: 'Midnight Train',
    episode: 8,
    universe: 'train',
    pillar: 'focus',
    seriesId: MIDNIGHT_SERIES_ID,
    experience: 'Midnight Train Journey',
    mainSound: 'Train Rhythm & Rain',
    environment: 'train',
    weather: 'rain',
    time: 'night',
    purpose: 'study',
    audioLayers: ['train', 'rain', 'wind', 'room_ambience'],
    layerVolumes: { train: 0.45, rain: 0.3, wind: 0.1, room_ambience: 0.15 },
    events: [{ type: 'train_horn', minInterval: 180, maxInterval: 480, probability: 0.25 }],
    visualQueries: [
      'night train window rain cinematic',
      'train cabin interior night journey',
      'passenger train window dark countryside rain',
    ],
    visualEffects: { slowZoom: true, rainOverlay: true, lightFlicker: true },
    masterProfile: 'study',
    playlists: ['focus_study', 'rain', 'cozy_nights'],
    thumbnailStyle: 'train',
    titleTemplate: '{experience} — {mainSound} for {benefit} | {duration}',
    defaultDurationsMin: cozyFocusDurations,
    variations: [
      {
        id: 'study',
        label: 'Study Ride',
        purpose: 'study',
        titleSuffix: 'Study',
        benefit: 'Focus & Study',
      },
      {
        id: 'deep_sleep',
        label: 'Sleep Train',
        purpose: 'sleep',
        titleSuffix: 'Sleep',
        benefit: 'Deep Sleep',
        layerVolumeOverrides: { train: 0.35, rain: 0.35 },
      },
      {
        id: 'heavy_rain',
        label: 'Rainy Ride',
        purpose: 'immersive',
        titleSuffix: 'Rainy Ride',
        benefit: 'Immersion',
        layerVolumeOverrides: { rain: 0.4, train: 0.4 },
      },
      {
        id: 'gentle',
        label: 'Quiet Carriage',
        purpose: 'relax',
        titleSuffix: 'Quiet Carriage',
        benefit: 'Relaxation',
        layerVolumeOverrides: { train: 0.3, room_ambience: 0.25 },
      },
    ],
  },
  {
    id: 'RAIN_ON_WINDOW',
    name: 'Rain on Window',
    episode: 9,
    universe: 'window',
    pillar: 'sleep',
    seriesId: MIDNIGHT_SERIES_ID,
    experience: 'Gentle Rain on a Window',
    mainSound: 'Window Rain & Soft Room Tone',
    environment: 'room',
    weather: 'rain',
    time: 'night',
    purpose: 'sleep',
    audioLayers: ['rain', 'room_ambience', 'wind'],
    layerVolumes: { rain: 0.55, room_ambience: 0.25, wind: 0.12 },
    events: [{ type: 'wind_gust', minInterval: 60, maxInterval: 180, probability: 0.3 }],
    visualQueries: [
      'rain on window night bedroom cinematic',
      'raindrops glass window dark room',
      'window rain city lights soft blur night',
    ],
    visualEffects: { slowZoom: true, rainOverlay: true, lightFlicker: false },
    masterProfile: 'sleep',
    playlists: ['rain', 'deep_sleep'],
    thumbnailStyle: 'window',
    titleTemplate: '{experience} — {mainSound} for {benefit} | {duration}',
    defaultDurationsMin: sleepDurations,
    variations: [
      {
        id: 'deep_sleep',
        label: 'Deep Sleep',
        purpose: 'sleep',
        titleSuffix: 'Deep Sleep',
        benefit: 'Deep Sleep',
      },
      {
        id: 'gentle',
        label: 'Soft Rain',
        purpose: 'relax',
        titleSuffix: 'Soft Rain',
        benefit: 'Relaxation',
        layerVolumeOverrides: { rain: 0.4 },
      },
      {
        id: 'heavy_rain',
        label: 'Heavy Window Rain',
        purpose: 'immersive',
        titleSuffix: 'Heavy Rain',
        benefit: 'Immersion',
        layerVolumeOverrides: { rain: 0.7 },
      },
      {
        id: 'study',
        label: 'Focus Rain',
        purpose: 'study',
        titleSuffix: 'Focus',
        benefit: 'Focus & Study',
      },
    ],
  },
  {
    id: 'NIGHT_MOUNTAIN',
    name: 'Night Mountain',
    episode: 10,
    universe: 'mountain',
    pillar: 'sleep',
    seriesId: MIDNIGHT_SERIES_ID,
    experience: 'Night Mountain Wind',
    mainSound: 'Mountain Wind & Distant Nature',
    environment: 'mountain',
    weather: 'wind',
    time: 'night',
    purpose: 'sleep',
    audioLayers: ['mountain_wind', 'wind', 'forest', 'leaves'],
    layerVolumes: { mountain_wind: 0.4, wind: 0.25, forest: 0.2, leaves: 0.15 },
    events: [{ type: 'wind_gust', minInterval: 35, maxInterval: 120, probability: 0.55 }],
    visualQueries: [
      'mountain night stars cinematic landscape',
      'alpine ridge moonlight night',
      'snow mountain peak night sky stars',
    ],
    visualEffects: { slowZoom: true, rainOverlay: false, lightFlicker: false },
    masterProfile: 'sleep',
    playlists: ['nature', 'deep_sleep'],
    thumbnailStyle: 'mountain',
    titleTemplate: '{experience} — {mainSound} for {benefit} | {duration}',
    defaultDurationsMin: sleepDurations,
    variations: [
      {
        id: 'deep_sleep',
        label: 'Deep Sleep',
        purpose: 'sleep',
        titleSuffix: 'Deep Sleep',
        benefit: 'Deep Sleep',
      },
      {
        id: 'wind',
        label: 'Strong Wind',
        purpose: 'immersive',
        titleSuffix: 'Strong Wind',
        benefit: 'Immersion',
        layerVolumeOverrides: { mountain_wind: 0.55, wind: 0.35 },
      },
      {
        id: 'gentle',
        label: 'Soft Peak',
        purpose: 'relax',
        titleSuffix: 'Soft Peak',
        benefit: 'Relaxation',
        layerVolumeOverrides: { mountain_wind: 0.3, wind: 0.15 },
      },
      {
        id: 'study',
        label: 'Focus Peak',
        purpose: 'study',
        titleSuffix: 'Focus',
        benefit: 'Focus & Study',
      },
    ],
  },
];

export type MidnightRecipeId = (typeof MIDNIGHT_RECIPES)[number]['id'];

const RECIPE_BY_ID = Object.fromEntries(
  MIDNIGHT_RECIPES.map((r) => [r.id, r]),
) as Record<string, MidnightRecipeDefinition>;

/** Mapeia presets legados → recipe Midnight. */
export const LEGACY_PRESET_TO_RECIPE: Record<string, string> = {
  RAIN_SLEEP: 'RAINY_CABIN',
  COZY_FIREPLACE: 'COZY_FIREPLACE',
  FOREST_NIGHT: 'MIDNIGHT_FOREST',
  OCEAN_SLEEP: 'MIDNIGHT_OCEAN',
  RAINY_CAFE: 'RAINY_COFFEE_SHOP',
  THUNDERSTORM: 'FOREST_THUNDERSTORM',
  BROWN_NOISE: 'RAIN_ON_WINDOW',
  RAINY_CABIN: 'RAINY_CABIN',
  FOREST_THUNDERSTORM: 'FOREST_THUNDERSTORM',
  MIDNIGHT_OCEAN: 'MIDNIGHT_OCEAN',
  MIDNIGHT_FOREST: 'MIDNIGHT_FOREST',
  RAINY_COFFEE_SHOP: 'RAINY_COFFEE_SHOP',
  WINTER_CABIN: 'WINTER_CABIN',
  MIDNIGHT_TRAIN: 'MIDNIGHT_TRAIN',
  RAIN_ON_WINDOW: 'RAIN_ON_WINDOW',
  NIGHT_MOUNTAIN: 'NIGHT_MOUNTAIN',
};

export function getMidnightRecipe(id: string | null | undefined): MidnightRecipeDefinition {
  if (!id) return MIDNIGHT_RECIPES[0]!;
  const mapped = LEGACY_PRESET_TO_RECIPE[id] ?? id;
  return RECIPE_BY_ID[mapped] ?? MIDNIGHT_RECIPES[0]!;
}

export function getMidnightVariation(
  recipe: MidnightRecipeDefinition,
  variationId: string | null | undefined,
): MidnightVariation {
  if (variationId) {
    const found = recipe.variations.find((v) => v.id === variationId);
    if (found) return found;
  }
  return recipe.variations[0]!;
}

export function resolveLayerVolumes(
  recipe: MidnightRecipeDefinition,
  variation: MidnightVariation,
): Record<string, number> {
  return { ...recipe.layerVolumes, ...(variation.layerVolumeOverrides ?? {}) };
}

export function resolveEvents(
  recipe: MidnightRecipeDefinition,
  variation: MidnightVariation,
): MidnightRecipeEvent[] {
  return variation.eventOverrides ?? recipe.events;
}

export function formatDurationLabel(durationMinutes: number): string {
  const hours = durationMinutes / 60;
  if (hours >= 1) {
    const label = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
    return `${label} Hour${hours === 1 ? '' : 's'}`;
  }
  return `${durationMinutes} Minutes`;
}

export function buildMidnightTitle(opts: {
  recipe: MidnightRecipeDefinition;
  variation: MidnightVariation;
  durationMinutes: number;
}): string {
  const duration = formatDurationLabel(opts.durationMinutes);
  const raw = opts.recipe.titleTemplate
    .replace('{experience}', opts.recipe.experience)
    .replace('{mainSound}', opts.recipe.mainSound)
    .replace('{benefit}', opts.variation.benefit)
    .replace('{duration}', duration);
  return raw.slice(0, 100);
}

export function buildShortsTitle(opts: {
  recipe: MidnightRecipeDefinition;
  variation: MidnightVariation;
}): string {
  return `POV: ${opts.recipe.experience}… ${opts.variation.benefit}`.slice(0, 100);
}

export function defaultDurationsForPillar(pillar: MidnightPillar): number[] {
  if (pillar === 'sleep') return sleepDurations;
  return cozyFocusDurations;
}

export function recipesForUniverse(universe: MidnightUniverse): MidnightRecipeDefinition[] {
  return MIDNIGHT_RECIPES.filter((r) => r.universe === universe);
}
