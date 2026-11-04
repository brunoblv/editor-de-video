/**
 * Presets do Reactive Lyrics (docs/reactive-lyrics-studio-requisitos.md §5).
 * O comportamento visual de cada preset vive no template `reactive-lyrics`;
 * aqui ficam a paleta inicial e os vínculos áudio → efeito, que o usuário
 * pode ajustar (RF-024, RF-032) sem tocar no template.
 */

export type LyricsPresetId = 'NEON' | 'MINIMAL' | 'GLITCH_ROCK';

export type LyricsEffectBinding = {
  source: 'bass' | 'mids' | 'treble' | 'rms' | 'onset' | 'beat';
  target: 'scale' | 'glow' | 'opacity' | 'position' | 'particles';
  threshold: number;
  gain: number;
  smoothing: number;
  clamp: number;
  enabled: boolean;
};

export type LyricsPreset = {
  id: LyricsPresetId;
  name: string;
  /** Valor da variável `preset` do template. */
  templatePreset: 'neon' | 'minimal' | 'glitch_rock';
  palette: { accent: string; background: string; textColor: string };
  bindings: LyricsEffectBinding[];
};

/** Dados que o template lê de assets/lyrics-data.js. Tempos em ms relativos ao início do trecho. */
export type LyricsCompositionData = {
  durationMs: number;
  lines: Array<{ id: string; text: string; startMs: number; endMs: number; words: Array<{ text: string; startMs: number; endMs: number }> | null }>;
  features: { sampleIntervalMs: number; rms: number[]; bass: number[]; mids: number[]; treble: number[] };
  onsets: Array<{ timeMs: number; strength: number }>;
  beatTimesMs: number[];
  sections: Array<{ type: string; startMs: number; endMs: number }>;
  bindings: LyricsEffectBinding[];
};

/**
 * Script carregado de forma síncrona pelo template: a timeline GSAP precisa
 * ser montada sem espera assíncrona para o seek determinístico do Hyperframes.
 * É JSON puro atribuído a uma variável; nenhum texto do usuário vira código.
 */
export function buildLyricsDataScript(data: LyricsCompositionData): string {
  return `window.__LYRICS__ = ${JSON.stringify(data)};\n`;
}

const bind = (b: Partial<LyricsEffectBinding> & Pick<LyricsEffectBinding, 'source' | 'target'>): LyricsEffectBinding => ({
  threshold: 0,
  gain: 1,
  smoothing: 0,
  clamp: 1,
  enabled: true,
  ...b,
});

export const LYRICS_PRESETS: Record<LyricsPresetId, LyricsPreset> = {
  NEON: {
    id: 'NEON',
    name: 'Neon Cinematic',
    templatePreset: 'neon',
    palette: { accent: '#7C5CFF', background: '#05040E', textColor: '#F2F0FF' },
    bindings: [
      bind({ source: 'bass', target: 'scale', gain: 0.8, smoothing: 0.55, clamp: 0.9 }),
      bind({ source: 'treble', target: 'glow', gain: 1, smoothing: 0.5 }),
      bind({ source: 'rms', target: 'opacity', gain: 1, smoothing: 0.75 }),
      bind({ source: 'onset', target: 'particles', threshold: 0.65 }),
    ],
  },
  MINIMAL: {
    id: 'MINIMAL',
    name: 'Minimal Lyrics',
    templatePreset: 'minimal',
    palette: { accent: '#F25C2A', background: '#F3EFE8', textColor: '#1B1B1F' },
    bindings: [
      bind({ source: 'bass', target: 'scale', gain: 0.35, smoothing: 0.8, clamp: 0.6 }),
      bind({ source: 'rms', target: 'opacity', gain: 0.6, smoothing: 0.85 }),
    ],
  },
  GLITCH_ROCK: {
    id: 'GLITCH_ROCK',
    name: 'Glitch Rock',
    templatePreset: 'glitch_rock',
    palette: { accent: '#FF2A55', background: '#0A0A0A', textColor: '#F5F5F5' },
    bindings: [
      bind({ source: 'bass', target: 'scale', gain: 1, smoothing: 0.3 }),
      bind({ source: 'onset', target: 'position', threshold: 0.55, gain: 1.2 }),
      bind({ source: 'treble', target: 'glow', gain: 0.6, smoothing: 0.4 }),
      bind({ source: 'rms', target: 'opacity', gain: 0.8, smoothing: 0.6 }),
    ],
  },
};
