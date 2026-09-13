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

/**
 * Estilo visual das legendas, escolhido por vídeo (nunca por linha).
 * - minimal: texto limpo, sem caixa, sem marcação — o padrão.
 * - highlight: igual ao minimal, mas a palavra sendo narrada no momento
 *   ganha uma marca de marca-texto (bege/amarelo).
 * - handwritten: igual ao minimal, com fonte manuscrita.
 * A última legenda do vídeo sempre ganha um tratamento especial (cartão
 * escuro, texto em destaque) independente do estilo escolhido — reforça a
 * frase de fechamento.
 */
export type CaptionStyle = 'minimal' | 'highlight' | 'handwritten';

export const CAPTION_STYLES: CaptionStyle[] = ['minimal', 'highlight', 'handwritten'];

/** Valida o valor vindo do banco/formulário, caindo no padrão configurado se inválido/ausente. */
export function resolveCaptionStyle(value: string | null | undefined, fallback: CaptionStyle): CaptionStyle {
  return CAPTION_STYLES.includes(value as CaptionStyle) ? (value as CaptionStyle) : fallback;
}

export type RenderClip = {
  /** URL absoluta do clipe já normalizado, servida pelo worker durante o render. */
  src: string;
  /** Posição no ranking já invertida para exibição: 5, 4, 3... */
  rank: number;
  /** Texto de contexto opcional exibido sobre o clipe. */
  label: string | null;
  durationInFrames: number;
  /** Legendas geradas automaticamente (opcional). */
  captions?: CaptionSegment[];
};

// Type alias (não interface): o Remotion exige props atribuíveis a
// Record<string, unknown>, e interfaces não recebem index signature implícita.
export type TopListProps = {
  title: string;
  watermark: string | null;
  clips: RenderClip[];
  captionStyle: CaptionStyle;
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
  | 'PUBLISHED'
  | 'FAILED';

export type ProjectKindValue = 'TOP_LIST' | 'CURIOSIDADE' | 'AMBIENT' | 'CHRISTIAN';

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
  universe?: string;
  recipeId?: string;
  variationId?: string;
  seriesId?: string;
  seriesEpisode?: number;
  playlists?: string[];
  thumbnailStyle?: string;
  mainSound?: string;
  benefit?: string;
  experience?: string;
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
  strategy: 'continuous' | 'loop' | 'kenburns' | 'synthetic';
  queries: string[];
  clips: Array<{
    query: string;
    provider?: string;
    sourceUrl?: string;
    localFile?: string;
    durationSec: number;
    author?: string;
    license?: string;
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
  captionStyle: CaptionStyle;
};

export function curiosidadeDurationInFrames(props: CuriosidadeProps): number {
  return props.scenes.reduce((acc, scene) => acc + scene.durationInFrames, 0);
}

/** Estado visual do personagem central (metáfora de transformação espiritual). */
export type CharacterState = {
  /** 0 = quase sem cor, 1 = cores completas. */
  colorLevel: number;
  /** 0 = iluminação mínima, 1 = totalmente iluminado. */
  lightLevel: number;
  /** 0 = silhueta vazia, 1 = detalhes completos. */
  detailLevel: number;
  emotion: 'sad' | 'calm' | 'hopeful' | 'joyful' | 'peaceful';
  pose: 'standing' | 'sitting' | 'kneeling' | 'walking' | 'looking_up';
  environment: 'dark_room' | 'window' | 'path' | 'field' | 'sunrise';
  particles: boolean;
};

export type ChristianScene = {
  src: string;
  durationInFrames: number;
};

export type ChristianProps = {
  title: string;
  watermark: string | null;
  pillarLabel: string;
  hookText: string;
  verse: { reference: string; text: string } | null;
  reflectionText: string;
  ctaText: string;
  voiceoverUrl: string;
  musicUrl: string | null;
  musicVolume: number;
  scenes: ChristianScene[];
  captions: CaptionSegment[];
  captionStyle: CaptionStyle;
  /** Estado inicial e final do personagem — interpola linearmente ao longo do vídeo. */
  characterStart: CharacterState;
  characterEnd: CharacterState;
};

export function christianDurationInFrames(props: ChristianProps): number {
  return props.scenes.reduce((acc, scene) => acc + scene.durationInFrames, 0);
}

export type RabiscoEmotion =
  | 'leveza'
  | 'reflexao'
  | 'desabafo'
  | 'ideia'
  | 'gratidao'
  | 'confuso'
  | 'surpresa';

export type RabiscoAction =
  | 'thinking'
  | 'writing'
  | 'reading'
  | 'walking'
  | 'coffee'
  | 'music'
  | 'sky'
  | 'sitting'
  | 'sharing'
  | 'learning'
  | 'speaking'
  | 'pointing'
  | 'waving'
  | 'surprised'
  | 'celebrating'
  | 'sad';

export type RabiscoPosition = 'center' | 'left' | 'right' | 'bottom';

export type RabiscoAnimation = 'fade' | 'slide-left' | 'slide-right' | 'rise' | 'float' | 'zoom';

export type RabiscoScene = {
  startFrame: number;
  durationInFrames: number;
  emotion: RabiscoEmotion;
  action: RabiscoAction;
  position: RabiscoPosition;
  animation: RabiscoAnimation;
  /** Pensamento visual curto (ex: "E se?"). Sem isso, nenhum balão é exibido. */
  thought?: string;
  /**
   * URL absoluta do PNG do personagem para esta cena, já servida pelo worker
   * durante o render (mesmo mecanismo do voiceoverUrl/scenes do Christian) —
   * o Remotion não tem acesso ao `public/` do apps/web, então nunca resolve
   * `action` sozinho.
   */
  assetUrl: string;
};

export type RabiscoProps = {
  title: string;
  watermark: string | null;
  voiceoverUrl: string;
  musicUrl: string | null;
  musicVolume: number;
  scenes: RabiscoScene[];
  captions: CaptionSegment[];
  captionStyle: CaptionStyle;
};

export function rabiscoDurationInFrames(props: RabiscoProps): number {
  return props.scenes.reduce(
    (acc, scene) => Math.max(acc, scene.startFrame + scene.durationInFrames),
    0,
  );
}
