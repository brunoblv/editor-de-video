/**
 * Contrato de render compartilhado entre o worker (que monta as props) e o
 * pacote de vídeo (que as consome).
 *
 * IMPORTANTE: este módulo é exposto como `@editor-video/core/render` e vai
 * parar no bundle de browser do Remotion — não pode importar nada de Node.
 */

export type CaptionWord = {
  text: string;
  startFrame: number;
  endFrame: number;
};

export type CaptionSegment = {
  text: string;
  /** Frames relativos ao início do clipe. */
  startFrame: number;
  endFrame: number;
  words?: CaptionWord[];
};

export type RenderClip = {
  /** URL absoluta do clipe já normalizado, servida pelo worker durante o render. */
  src: string;
  /** Posição no ranking já invertida para exibição: 5, 4, 3... */
  rank: number;
  /** Texto de contexto opcional exibido sobre o clipe. */
  label: string | null;
  durationInFrames: number;
  /** Legendas geradas por Whisper (opcional). */
  captions?: CaptionSegment[];
};

// Type alias (não interface): o Remotion exige props atribuíveis a
// Record<string, unknown>, e interfaces não recebem index signature implícita.
export type TopListProps = {
  title: string;
  watermark: string | null;
  clips: RenderClip[];
};

export const INTRO_DURATION_FRAMES = 75;
export const COUNTDOWN_DURATION_FRAMES = 30;
export const OUTRO_DURATION_FRAMES = 45;

/** Fonte única da verdade da duração total — usada no calculateMetadata e no worker. */
export function totalDurationInFrames(props: TopListProps): number {
  const clipsTotal = props.clips.reduce(
    (acc, clip) => acc + COUNTDOWN_DURATION_FRAMES + clip.durationInFrames,
    0,
  );
  return INTRO_DURATION_FRAMES + clipsTotal + OUTRO_DURATION_FRAMES;
}

export type ProjectStatusValue =
  | 'DRAFT'
  | 'QUEUED'
  | 'PROCESSING'
  | 'WAITING_PREVIEW_APPROVAL'
  | 'READY'
  | 'READY_FOR_REVIEW'
  | 'FAILED';

export type ProjectKindValue = 'TOP_LIST' | 'CURIOSIDADE' | 'AMBIENT';

export type AmbientPurpose = 'sleep' | 'relax' | 'study' | 'immersive';

export type AmbientLayerType = 'base' | 'texture' | 'environment' | 'event';

export type AmbientConcept = {
  title: string;
  environment: string;
  weather: string;
  time: string;
  purpose: AmbientPurpose;
  durationMinutes: number;
  audioLayers: string[];
  visualQueries: string[];
  format?: 'youtube' | 'shorts';
};

export type AmbientSoundEvent = {
  type: string;
  atSec: number;
  volume: number;
  pan: number;
  distance: 'near' | 'medium' | 'distant';
  assetHint?: string;
};

export type AmbientAudioLayer = {
  id: string;
  kind: string;
  layerType: AmbientLayerType;
  volume: number;
  pan: number;
  source: 'library' | 'synthetic' | 'noise';
  category?: string;
  assetId?: string;
};

export type AmbientAudioTimeline = {
  seed: number;
  durationSec: number;
  layers: AmbientAudioLayer[];
  events: AmbientSoundEvent[];
  intensitySegments: Array<{ startSec: number; endSec: number; intensity: number }>;
};

export type AmbientVisualTimeline = {
  strategy: 'continuous' | 'loop' | 'kenburns';
  queries: string[];
  clips: Array<{
    query: string;
    provider?: string;
    sourceUrl?: string;
    localFile?: string;
    durationSec: number;
  }>;
  effects: {
    slowZoom: boolean;
    rainOverlay: boolean;
    lightFlicker: boolean;
  };
};

export type CuriosidadeScene = {
  src: string;
  durationInFrames: number;
};

export type CuriosidadeProps = {
  title: string;
  watermark: string | null;
  hookText: string;
  voiceoverUrl: string;
  scenes: CuriosidadeScene[];
  /** Legendas relativas ao início do vídeo completo. */
  captions: CaptionSegment[];
};

export function curiosidadeDurationInFrames(props: CuriosidadeProps): number {
  return props.scenes.reduce((acc, scene) => acc + scene.durationInFrames, 0);
}
