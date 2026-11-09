/**
 * Efeitos reativos do Reactive Lyrics (docs/claude-reactive-lyrics-implementacao.md §5).
 *
 * Os vínculos áudio → efeito são calculados aqui, por frame, a partir do
 * MusicalMap. O template só lê os valores prontos, então:
 * - o efeito é testável sem navegador (mudar graves muda a escala, não o brilho);
 * - prévia de trecho e render final dão o mesmo valor no mesmo instante da
 *   música: a suavização roda sobre a música inteira, no grid do mapa;
 * - nada depende de relógio real nem de aleatoriedade sem semente.
 */
import { z } from 'zod';
import type { Rate } from '@editor-video/timeline';
import { SECTION_TYPES, type MusicalMap } from './lyrics.js';
import {
  groupLyricWords,
  LYRIC_DISPLAY_MODES,
  parseEmphasisWords,
  parseScenesParam,
  planScenes,
  SCENE_CHANGE_POLICIES,
  type CinematicGroup,
  type LyricDisplayMode,
  type PlannedScene,
  type SceneChangePolicy,
} from './lyrics-cinematic.js';

export const EFFECT_SOURCES = ['bass', 'mids', 'treble', 'rms', 'onset', 'beat'] as const;
/** `bgZoom` (microzoom do cenário) e `brightness` (brilho do cenário) agem só na camada de fundo. */
export const EFFECT_TARGETS = ['scale', 'glow', 'opacity', 'translate', 'particles', 'glitch', 'bgZoom', 'brightness'] as const;

export const effectBindingSchema = z
  .object({
    source: z.enum(EFFECT_SOURCES),
    target: z.enum(EFFECT_TARGETS),
    gain: z.number().min(0).max(4).default(1),
    /** Valores (ou força de evento) abaixo do limiar não acionam o efeito. */
    threshold: z.number().min(0).max(0.99).default(0),
    /** Constante de tempo da suavização (séries) ou do decaimento (eventos). */
    smoothingMs: z.number().int().min(0).max(2000).default(0),
    /** Intervalo mínimo entre disparos de evento. */
    cooldownMs: z.number().int().min(0).max(5000).default(0),
    clampMin: z.number().min(0).max(1).default(0),
    clampMax: z.number().min(0).max(1).default(1),
    enabled: z.boolean().default(true),
  })
  .refine((b) => b.clampMax >= b.clampMin, { message: 'clampMax deve ser ≥ clampMin', path: ['clampMax'] });

export type EffectBinding = z.infer<typeof effectBindingSchema>;
export type EffectBindingInput = z.input<typeof effectBindingSchema>;

export type TemplatePreset = 'neon' | 'minimal' | 'glitch_rock' | 'cinematic';
export type LyricsPresetId = 'NEON_CINEMATIC' | 'MINIMAL_LYRICS' | 'GLITCH_ROCK' | 'CINEMATIC_ATMOSPHERIC_LYRICS';
export const LYRICS_PRESET_IDS = ['CINEMATIC_ATMOSPHERIC_LYRICS', 'NEON_CINEMATIC', 'MINIMAL_LYRICS', 'GLITCH_ROCK'] as const satisfies readonly LyricsPresetId[];
/** Preset principal de referência (docs/v3/reactive-lyrics-cinematic.md). */
export const DEFAULT_LYRICS_PRESET: LyricsPresetId = 'CINEMATIC_ATMOSPHERIC_LYRICS';

export type LyricsPreset = {
  id: LyricsPresetId;
  name: string;
  /** Valor da variável `preset` do template `reactive-lyrics`. */
  templatePreset: TemplatePreset;
  palette: { accent: string; background: string; textColor: string };
  bindings: EffectBinding[];
};

const bind = (b: EffectBindingInput) => effectBindingSchema.parse(b);

export const LYRICS_PRESETS: Record<LyricsPresetId, LyricsPreset> = {
  CINEMATIC_ATMOSPHERIC_LYRICS: {
    id: 'CINEMATIC_ATMOSPHERIC_LYRICS',
    name: 'Cinematic Atmospheric',
    templatePreset: 'cinematic',
    palette: { accent: '#8FD8FF', background: '#03050B', textColor: '#FFFFFF' },
    // Reação percebida na composição inteira, sem visualizador explícito:
    // graves → microzoom do cenário e pulso leve da letra; agudos → brilho/reflexo; transientes → poeira de luz.
    bindings: [
      bind({ source: 'bass', target: 'bgZoom', gain: 0.9, smoothingMs: 70 }),
      bind({ source: 'bass', target: 'scale', gain: 0.5, smoothingMs: 60, clampMax: 0.8 }),
      bind({ source: 'treble', target: 'brightness', gain: 0.8, smoothingMs: 90 }),
      bind({ source: 'treble', target: 'glow', gain: 0.5, smoothingMs: 70 }),
      bind({ source: 'onset', target: 'particles', threshold: 0.72, cooldownMs: 600 }),
    ],
  },
  NEON_CINEMATIC: {
    id: 'NEON_CINEMATIC',
    name: 'Neon Cinematic',
    templatePreset: 'neon',
    palette: { accent: '#7C5CFF', background: '#05040E', textColor: '#F2F0FF' },
    bindings: [
      bind({ source: 'bass', target: 'scale', gain: 0.8, smoothingMs: 25, clampMax: 0.9 }),
      bind({ source: 'treble', target: 'glow', gain: 1, smoothingMs: 20 }),
      bind({ source: 'rms', target: 'opacity', gain: 1, smoothingMs: 60 }),
      bind({ source: 'onset', target: 'particles', threshold: 0.65, cooldownMs: 250 }),
    ],
  },
  MINIMAL_LYRICS: {
    id: 'MINIMAL_LYRICS',
    name: 'Minimal Lyrics',
    templatePreset: 'minimal',
    palette: { accent: '#F25C2A', background: '#F3EFE8', textColor: '#1B1B1F' },
    bindings: [
      bind({ source: 'bass', target: 'scale', gain: 0.35, smoothingMs: 90, clampMax: 0.6 }),
      bind({ source: 'rms', target: 'opacity', gain: 0.6, smoothingMs: 120 }),
    ],
  },
  GLITCH_ROCK: {
    id: 'GLITCH_ROCK',
    name: 'Glitch Rock',
    templatePreset: 'glitch_rock',
    palette: { accent: '#FF2A55', background: '#0A0A0A', textColor: '#F5F5F5' },
    bindings: [
      bind({ source: 'bass', target: 'scale', gain: 1, smoothingMs: 10 }),
      bind({ source: 'onset', target: 'translate', threshold: 0.55, gain: 1.2, cooldownMs: 120 }),
      bind({ source: 'onset', target: 'glitch', threshold: 0.55, gain: 1, cooldownMs: 120 }),
      bind({ source: 'treble', target: 'glow', gain: 0.6, smoothingMs: 15 }),
      bind({ source: 'rms', target: 'opacity', gain: 0.8, smoothingMs: 35 }),
    ],
  },
};

export function presetByTemplateValue(value: string): LyricsPreset {
  const found = Object.values(LYRICS_PRESETS).find((p) => p.templatePreset === value);
  if (!found) throw new Error(`Preset desconhecido: ${value}`);
  return found;
}

/**
 * Teto de cada alvo por preset: mantém a letra legível (escala, tremor e
 * separação RGB limitados), mesmo com ganho alto.
 */
export const TARGET_LIMITS: Record<TemplatePreset, { scale: number; glow: number; shake: number; split: number; bgZoom: number; brightness: number }> = {
  neon: { scale: 0.08, glow: 1.6, shake: 0.6, split: 0.3, bgZoom: 0.03, brightness: 0.12 },
  minimal: { scale: 0.03, glow: 0.4, shake: 0.3, split: 0.2, bgZoom: 0.015, brightness: 0.06 },
  glitch_rock: { scale: 0.12, glow: 1, shake: 1.6, split: 0.8, bgZoom: 0.04, brightness: 0.15 },
  // Sutil por definição: microzoom ≤ 3,5 % e brilho ≤ +14 %.
  cinematic: { scale: 0.035, glow: 0.7, shake: 0.2, split: 0.1, bgZoom: 0.035, brightness: 0.14 },
};

/** Efeitos de impacto no máximo 3 por segundo com o limite de flashes (WCAG 2.3.1). */
export const FLASH_MIN_GAP_MS = 334;
const DEFAULT_DECAY_MS = 160;
const MIN_FLASH_SMOOTHING_MS = 60;

// ---------------------------------------------------------------------------
// Seções (marcos manuais, em ms da música)
// ---------------------------------------------------------------------------

export type SectionMark = { type: (typeof SECTION_TYPES)[number]; startMs: number; endMs: number };

/** "0-14000:verse;14000-30000:chorus" → seções ordenadas e sem sobreposição. */
export function parseSectionsParam(value: string): SectionMark[] {
  const marks: SectionMark[] = [];
  for (const raw of value.split(/[;,\n]/).map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\d+)\s*-\s*(\d+)\s*:\s*([a-z_]+)$/.exec(raw);
    if (!m) throw new Error(`Seção inválida: "${raw}" (use início-fim:tipo, em ms)`);
    const type = SECTION_TYPES.find((t) => t === m[3]);
    if (!type) throw new Error(`Tipo de seção desconhecido: ${m[3]}`);
    const startMs = Number(m[1]);
    const endMs = Number(m[2]);
    if (endMs <= startMs) throw new Error(`Seção "${raw}" termina antes de começar`);
    marks.push({ type, startMs, endMs });
  }
  marks.sort((a, b) => a.startMs - b.startMs);
  for (let i = 1; i < marks.length; i += 1) {
    if (marks[i]!.startMs < marks[i - 1]!.endMs) throw new Error('Seções sobrepostas');
  }
  return marks;
}

export function formatSectionsParam(marks: SectionMark[]): string {
  return marks.map((m) => `${m.startMs}-${m.endMs}:${m.type}`).join(';');
}

/** Vínculos customizados ficam como JSON numa variável string do template. */
export function parseBindingsParam(value: unknown, preset: TemplatePreset): EffectBinding[] {
  if (typeof value !== 'string' || !value.trim()) return presetByTemplateValue(preset).bindings;
  return z.array(effectBindingSchema).max(12).parse(JSON.parse(value));
}

// ---------------------------------------------------------------------------
// Cálculo por frame
// ---------------------------------------------------------------------------

export type ReactiveOptions = {
  fps: Rate;
  /** Instante da música (ms) do frame 0 da composição. */
  startMs: number;
  frameCount: number;
  preset: TemplatePreset;
  bindings: EffectBinding[];
  /** 0–100; 0 desliga todo efeito reativo. */
  intensity: number;
  reducedMotion: boolean;
  limitFlashes: boolean;
  sections?: SectionMark[];
  /** 0–100 (padrão 100): escala individual dos alvos da letra (escala, brilho, tremor, glitch). */
  textReactivity?: number;
  /** 0–100 (padrão 100): escala individual dos alvos do cenário (fundo, microzoom, brilho, partículas). */
  backgroundReactivity?: number;
};

export type ReactiveEvent = { frame: number; strength: number; seed: number };

export type ReactiveFrames = {
  scale: number[];
  glow: number[];
  /** Opacidade do fundo (0,15–1). */
  bgOpacity: number[];
  /** Deslocamento em vmin. */
  dx: number[];
  dy: number[];
  /** Separação RGB (0–0,8). */
  split: number[];
  /** Microzoom do cenário (1 = sem zoom). */
  bgScale: number[];
  /** Brilho extra do cenário (0 = nenhum). */
  bgBright: number[];
  particles: ReactiveEvent[];
  glitches: ReactiveEvent[];
};

/** PRNG com semente (mulberry32), igual ao do template. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CONTINUOUS = new Set(['bass', 'mids', 'treble', 'rms']);
const MOTION_TARGETS = new Set(['scale', 'translate', 'particles', 'glitch', 'bgZoom']);
const IMPACT_TARGETS = new Set(['translate', 'particles', 'glitch', 'glow', 'opacity', 'brightness']);
const BACKGROUND_TARGETS = new Set(['opacity', 'bgZoom', 'brightness', 'particles']);

function emaOnGrid(series: readonly number[], intervalMs: number, smoothingMs: number): Float64Array {
  const out = new Float64Array(series.length);
  const alpha = smoothingMs <= 0 ? 1 : 1 - Math.exp(-intervalMs / smoothingMs);
  let acc = series[0] ?? 0;
  for (let i = 0; i < series.length; i += 1) {
    acc += alpha * ((series[i] ?? 0) - acc);
    out[i] = acc;
  }
  return out;
}

function sampleGrid(series: ArrayLike<number>, intervalMs: number, ms: number): number {
  const n = series.length;
  if (n === 0) return 0;
  const pos = Math.max(0, ms) / intervalMs;
  const i = Math.floor(pos);
  if (i >= n - 1) return series[n - 1]!;
  return series[i]! + (series[i + 1]! - series[i]!) * (pos - i);
}

function lastAtOrBefore(times: number[], ms: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= ms) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

type Prepared = {
  binding: EffectBinding;
  seed: number;
  series: Float64Array | null;
  events: Array<{ timeMs: number; strength: number }>;
  eventTimes: number[];
  decayMs: number;
};

function prepare(map: MusicalMap, binding: EffectBinding, index: number, opts: ReactiveOptions): Prepared {
  const interval = map.features.sampleIntervalMs;
  const impact = opts.limitFlashes && IMPACT_TARGETS.has(binding.target);
  const seed = 1000 + index * 7919;
  if (CONTINUOUS.has(binding.source)) {
    const smoothing = impact ? Math.max(binding.smoothingMs, MIN_FLASH_SMOOTHING_MS) : binding.smoothingMs;
    const series = emaOnGrid(map.features[binding.source as 'bass'], interval, smoothing);
    // Alvos de evento com fonte contínua: disparo na subida acima do limiar.
    const events: Prepared['events'] = [];
    if (binding.target === 'particles' || binding.target === 'glitch') {
      const gap = Math.max(binding.cooldownMs, impact ? FLASH_MIN_GAP_MS : 0);
      let last = -Infinity;
      for (let i = 1; i < series.length; i += 1) {
        const t = i * interval;
        if (series[i - 1]! < binding.threshold && series[i]! >= binding.threshold && t - last >= gap) {
          events.push({ timeMs: t, strength: Math.min(1, series[i]!) });
          last = t;
        }
      }
    }
    return { binding, seed, series, events, eventTimes: events.map((e) => e.timeMs), decayMs: DEFAULT_DECAY_MS };
  }
  const raw = binding.source === 'onset' ? map.onsets : map.beatTimesMs.map((t) => ({ timeMs: t, strength: 1 }));
  const gap = Math.max(binding.cooldownMs, impact ? FLASH_MIN_GAP_MS : 0);
  const events: Prepared['events'] = [];
  let last = -Infinity;
  for (const e of raw) {
    if (e.strength < binding.threshold || e.timeMs - last < gap) continue;
    events.push(e);
    last = e.timeMs;
  }
  return { binding, seed, series: null, events, eventTimes: events.map((e) => e.timeMs), decayMs: binding.smoothingMs > 0 ? binding.smoothingMs : DEFAULT_DECAY_MS };
}

function respond(p: Prepared, interval: number, ms: number): { v: number; event: number } {
  const b = p.binding;
  let v: number;
  let event = -1;
  if (p.series) {
    const x = sampleGrid(p.series, interval, ms);
    v = x <= b.threshold ? 0 : (x - b.threshold) / (1 - b.threshold);
    event = Math.floor(ms / interval);
  } else {
    event = lastAtOrBefore(p.eventTimes, ms);
    v = event < 0 ? 0 : p.events[event]!.strength * Math.exp(-(ms - p.events[event]!.timeMs) / p.decayMs);
  }
  return { v: Math.min(b.clampMax, Math.max(b.clampMin, v * b.gain)), event };
}

const round = (v: number) => Math.round(v * 10000) / 10000;

export function computeReactiveFrames(map: MusicalMap, opts: ReactiveOptions): ReactiveFrames {
  const n = opts.frameCount;
  const out: ReactiveFrames = {
    scale: new Array(n).fill(1),
    glow: new Array(n).fill(0),
    bgOpacity: new Array(n).fill(1),
    dx: new Array(n).fill(0),
    dy: new Array(n).fill(0),
    split: new Array(n).fill(0),
    bgScale: new Array(n).fill(1),
    bgBright: new Array(n).fill(0),
    particles: [],
    glitches: [],
  };
  const k = Math.max(0, Math.min(100, opts.intensity)) / 100;
  if (k === 0 || n === 0) return out;

  const interval = map.features.sampleIntervalMs;
  const limits = TARGET_LIMITS[opts.preset];
  const msPerFrame = (1000 * opts.fps.den) / opts.fps.num;
  const sections = opts.sections ?? [];
  const sectionGain = (ms: number) => {
    if (opts.preset === 'minimal') return 1;
    const s = sections.find((x) => ms >= x.startMs && ms < x.endMs);
    // Ponte desacelera só no Cinematic (os presets anteriores mantêm o comportamento).
    if (opts.preset === 'cinematic' && s?.type === 'bridge') return 0.6;
    return s?.type === 'chorus' ? 1.25 : s?.type === 'verse' ? 0.8 : 1;
  };
  const pct = (v: number | undefined) => Math.max(0, Math.min(100, v ?? 100)) / 100;
  const textK = pct(opts.textReactivity);
  const bgK = pct(opts.backgroundReactivity);
  const layerGain = (target: string) => (BACKGROUND_TARGETS.has(target) ? bgK : textK);
  const prepared = opts.bindings
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.enabled && !(opts.reducedMotion && MOTION_TARGETS.has(b.target)))
    .map(({ b, i }) => prepare(map, b, i, opts));

  for (let f = 0; f < n; f += 1) {
    const ms = opts.startMs + f * msPerFrame;
    const gAll = k * sectionGain(ms);
    let scale = 1;
    let glow = 0;
    let bg = 1;
    let dx = 0;
    let dy = 0;
    let split = 0;
    let bgScale = 1;
    let bgBright = 0;
    for (const p of prepared) {
      const g = gAll * layerGain(p.binding.target);
      if (g === 0) continue;
      const { v, event } = respond(p, interval, ms);
      switch (p.binding.target) {
        case 'scale':
          scale += v * limits.scale * g;
          break;
        case 'glow':
          glow += v * limits.glow * g * (opts.reducedMotion ? 0.5 : 1);
          break;
        case 'opacity':
          bg = Math.min(bg, 1 - g * 0.65 * (1 - v));
          break;
        case 'translate': {
          if (event < 0 || v === 0) break;
          const r = seededRandom(p.seed + event);
          dx += (r() * 2 - 1) * v * limits.shake * g;
          dy += (r() * 2 - 1) * v * limits.shake * 0.5 * g;
          break;
        }
        case 'glitch':
          split += v * limits.split * g;
          break;
        case 'bgZoom':
          bgScale += v * limits.bgZoom * g;
          break;
        case 'brightness':
          bgBright += v * limits.brightness * g * (opts.reducedMotion ? 0.5 : 1);
          break;
        default:
          break;
      }
    }
    out.scale[f] = round(scale);
    out.glow[f] = round(glow);
    out.bgOpacity[f] = round(Math.max(0.15, bg));
    out.dx[f] = round(dx);
    out.dy[f] = round(dy);
    out.split[f] = round(Math.min(0.8, split));
    out.bgScale[f] = round(Math.min(1 + limits.bgZoom * 1.5, bgScale));
    out.bgBright[f] = round(Math.min(limits.brightness * 1.5, bgBright));
  }

  // Eventos discretos (partículas, barras de glitch) dentro da janela.
  const endMs = opts.startMs + n * msPerFrame;
  for (const p of prepared) {
    if (p.binding.target !== 'particles' && p.binding.target !== 'glitch') continue;
    p.events.forEach((e, index) => {
      if (e.timeMs < opts.startMs || e.timeMs >= endMs) return;
      const strength = round(Math.min(p.binding.clampMax, e.strength * p.binding.gain) * k * sectionGain(e.timeMs) * layerGain(p.binding.target));
      if (strength <= 0) return;
      const frame = Math.min(n - 1, Math.round((e.timeMs - opts.startMs) / msPerFrame));
      (p.binding.target === 'particles' ? out.particles : out.glitches).push({ frame, strength, seed: p.seed * 31 + index });
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dados da composição (assets/lyrics-data.js)
// ---------------------------------------------------------------------------

export const LYRICS_DATA_VERSION = 3;

export type LyricsDataLine = {
  id: string;
  text: string;
  /** ms relativos ao início da composição, alinhados ao frame. */
  startMs: number;
  endMs: number;
  words: Array<{ text: string; startMs: number; endMs: number }> | null;
};

export type LyricsCompositionData = {
  version: typeof LYRICS_DATA_VERSION;
  fps: Rate;
  frameCount: number;
  lines: LyricsDataLine[];
  reactive: Omit<ReactiveFrames, 'particles' | 'glitches'>;
  particles: ReactiveEvent[];
  glitches: ReactiveEvent[];
  /** Só no preset Cinematic: fragmentos da letra e plano de cenas (ms da composição). */
  cinematic?: { mode: LyricDisplayMode; policy: SceneChangePolicy; groups: CinematicGroup[]; scenes: PlannedScene[] };
};

/** Linha em frames relativos à composição (vem do plano de render). */
export type FrameLyricLine = {
  itemId: string;
  text: string;
  startFrame: number;
  endFrame: number;
  words: Array<{ text: string; startFrame: number; endFrame: number }> | null;
};

export type BuildLyricsDataInput = {
  map: MusicalMap;
  fps: Rate;
  frameCount: number;
  /** Instante da música (ms) do frame 0 da composição. */
  songStartMs: number;
  lines: FrameLyricLine[];
  /** Variáveis do template já validadas (preset, intensity, reducedMotion, limitFlashes, highlightMode, sections, bindings). */
  params: Record<string, unknown>;
};

export function buildLyricsCompositionData(input: BuildLyricsDataInput): LyricsCompositionData {
  const { fps, frameCount } = input;
  const p = input.params;
  const preset = (typeof p.preset === 'string' ? p.preset : 'neon') as TemplatePreset;
  const frameMs = (f: number) => Math.round(((f * 1000 * fps.den) / fps.num) * 1000) / 1000;
  const karaoke = p.highlightMode !== 'line';
  const sections = typeof p.sections === 'string' && p.sections.trim() ? parseSectionsParam(p.sections) : [];
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const reactive = computeReactiveFrames(input.map, {
    fps,
    startMs: input.songStartMs,
    frameCount,
    preset,
    bindings: parseBindingsParam(p.bindings, preset),
    intensity: num(p.intensity, 70),
    reducedMotion: p.reducedMotion === true,
    limitFlashes: p.limitFlashes !== false,
    sections,
    textReactivity: num(p.textAudioReactivity, 100),
    backgroundReactivity: num(p.backgroundAudioReactivity, 100),
  });
  const { particles, glitches, ...series } = reactive;
  const lines: LyricsDataLine[] = input.lines
    .filter((l) => l.endFrame > 0 && l.startFrame < frameCount)
    .map((l) => ({
      id: l.itemId,
      text: l.text,
      startMs: frameMs(l.startFrame),
      endMs: frameMs(l.endFrame),
      words: karaoke && l.words && l.words.length > 0 ? l.words.map((w) => ({ text: w.text, startMs: frameMs(w.startFrame), endMs: frameMs(w.endFrame) })) : null,
    }));
  const data: LyricsCompositionData = { version: LYRICS_DATA_VERSION, fps, frameCount, lines, reactive: series, particles, glitches };
  if (preset === 'cinematic') {
    const mode = (LYRIC_DISPLAY_MODES as readonly string[]).includes(String(p.lyricDisplayMode)) ? (p.lyricDisplayMode as LyricDisplayMode) : 'hybrid';
    const policy = (SCENE_CHANGE_POLICIES as readonly string[]).includes(String(p.sceneChangePolicy)) ? (p.sceneChangePolicy as SceneChangePolicy) : 'by_phrase';
    const groups = groupLyricWords(lines, {
      mode,
      maxWordsPerGroup: num(p.maxWordsPerGroup, 4),
      maxLines: num(p.maxLines, 3),
      emphasisWords: parseEmphasisWords(p.emphasisWords),
      autoEmphasis: p.autoEmphasis !== false,
    });
    const scenes = planScenes({
      entries: parseScenesParam(p.scenes),
      policy,
      groups,
      sections,
      songStartMs: input.songStartMs,
      durationMs: frameMs(frameCount),
      minSceneMs: num(p.minSceneSec, 6) * 1000,
      map: input.map,
    });
    data.cinematic = { mode, policy, groups, scenes };
  }
  return data;
}

/**
 * Script carregado de forma síncrona pelo template: a timeline GSAP precisa
 * ser montada sem espera assíncrona para o seek determinístico do Hyperframes.
 * É JSON puro atribuído a uma variável; nenhum texto do usuário vira código.
 */
export function buildLyricsDataScript(data: LyricsCompositionData): string {
  return `window.__LYRICS__ = ${JSON.stringify(data).replace(/</g, '\\u003c')};\n`;
}
