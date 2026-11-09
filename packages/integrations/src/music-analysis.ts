/**
 * Análise musical offline (Reactive Lyrics, RF-020..RF-024, RF-028): FFmpeg
 * decodifica para PCM mono e o restante é calculado aqui, sem Python.
 *
 * Saída no formato do MusicalMap: RMS e energia por banda normalizados 0–1,
 * onsets por fluxo espectral, BPM por autocorrelação do envelope de onsets
 * (prior em 120 BPM) e batidas por programação dinâmica (Ellis 2007, o mesmo
 * método do librosa.beat.beat_track). BPM sem pulso claro fica null.
 *
 * Determinístico: mesma entrada + mesma versão → mesmo mapa. Alterar
 * qualquer parâmetro abaixo exige novo MUSIC_ANALYSIS_VERSION (chave de cache).
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { runProcess, toolPaths, type ToolPaths } from './process.js';

export const MUSIC_ANALYSIS_VERSION = 'ev-ts-1.0.0';

const SAMPLE_RATE = 22_050;
const WINDOW = 2048;
/** Janela curta só para o fluxo de onsets: menos adiantamento do transiente. */
const FLUX_WINDOW = 1024;
const FLUX_BANDS = 36;
const BANDS = { bass: [20, 250], mids: [250, 4000], treble: [4000, 11_025] } as const;
const MIN_BPM = 50;
const MAX_BPM = 220;

export type MusicalMapData = {
  schemaVersion: 1;
  audioAssetId: string | null;
  audioHash: string;
  durationMs: number;
  analysisVersion: string;
  bpmEstimate: number | null;
  beatTimesMs: number[];
  onsets: Array<{ timeMs: number; strength: number }>;
  features: { sampleIntervalMs: number; rms: number[]; bass: number[]; mids: number[]; treble: number[] };
  sections: [];
};

export type AnalyzeMusicOptions = {
  audioHash: string;
  audioAssetId?: string | null;
  sampleIntervalMs?: number;
  /** Diretório para o PCM temporário (apagado ao final). */
  workDir: string;
  signal?: AbortSignal;
  paths?: ToolPaths;
};

export async function decodeMono(file: string, workDir: string, options: { signal?: AbortSignal; paths?: ToolPaths } = {}): Promise<Float32Array> {
  await fsp.mkdir(workDir, { recursive: true });
  const raw = path.join(workDir, `analysis-${process.pid}-${Date.now()}.f32`);
  try {
    await runProcess(
      (options.paths ?? toolPaths()).ffmpeg,
      ['-nostdin', '-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-y', raw],
      { signal: options.signal, timeoutMs: 10 * 60_000 },
    );
    const buf = await fsp.readFile(raw);
    // Cópia alinhada: o Buffer pode não começar em múltiplo de 4.
    const out = new Float32Array(buf.length >> 2);
    for (let i = 0; i < out.length; i += 1) out[i] = buf.readFloatLE(i * 4);
    return out;
  } finally {
    await fsp.rm(raw, { force: true });
  }
}

export async function analyzeMusic(file: string, options: AnalyzeMusicOptions): Promise<MusicalMapData> {
  const samples = await decodeMono(file, options.workDir, options);
  return analyzeSamples(samples, SAMPLE_RATE, options);
}

export function analyzeSamples(
  samples: Float32Array,
  sampleRate: number,
  options: Pick<AnalyzeMusicOptions, 'audioHash' | 'audioAssetId' | 'sampleIntervalMs'>,
): MusicalMapData {
  const intervalMs = options.sampleIntervalMs ?? 20;
  const durationMs = Math.round((samples.length / sampleRate) * 1000);
  if (durationMs <= 0) throw new Error('Áudio sem amostras');
  const hop = (sampleRate * intervalMs) / 1000;
  const frames = Math.ceil(durationMs / intervalMs);
  const binHz = sampleRate / WINDOW;
  const half = WINDOW / 2;
  const bandBins = Object.fromEntries(
    Object.entries(BANDS).map(([k, [lo, hi]]) => [k, [Math.max(1, Math.round(lo / binHz)), Math.min(half, Math.round(hi / binHz))]]),
  ) as Record<keyof typeof BANDS, [number, number]>;

  const hann = new Float64Array(WINDOW);
  for (let i = 0; i < WINDOW; i += 1) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / WINDOW);
  const re = new Float64Array(WINDOW);
  const im = new Float64Array(WINDOW);
  const fluxHalf = FLUX_WINDOW / 2;
  const fluxHann = new Float64Array(FLUX_WINDOW);
  for (let i = 0; i < FLUX_WINDOW; i += 1) fluxHann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FLUX_WINDOW);
  const fre = new Float64Array(FLUX_WINDOW);
  const fim = new Float64Array(FLUX_WINDOW);
  // Bandas log-espaçadas 30 Hz–11 kHz (como mel): graves pesam tanto quanto agudos.
  const fluxBinHz = sampleRate / FLUX_WINDOW;
  const edges = Array.from({ length: FLUX_BANDS + 1 }, (_, i) => Math.min(fluxHalf, Math.max(1, Math.round((30 * (11_000 / 30) ** (i / FLUX_BANDS)) / fluxBinHz))));
  const bandLog = new Float64Array(FLUX_BANDS);
  const prevBandLog = new Float64Array(FLUX_BANDS);

  const rms = new Float64Array(frames);
  const bass = new Float64Array(frames);
  const mids = new Float64Array(frames);
  const treble = new Float64Array(frames);
  const flux = new Float64Array(frames);

  for (let f = 0; f < frames; f += 1) {
    const center = Math.round(f * hop);
    let sq = 0;
    for (let i = 0; i < WINDOW; i += 1) {
      const idx = center - half + i;
      const v = idx >= 0 && idx < samples.length ? samples[idx]! : 0;
      sq += v * v;
      re[i] = v * hann[i]!;
      im[i] = 0;
    }
    rms[f] = Math.sqrt(sq / WINDOW);
    fft(re, im);
    const energy = { bass: 0, mids: 0, treble: 0 };
    for (let k = 1; k <= half; k += 1) {
      const p = re[k]! * re[k]! + im[k]! * im[k]!;
      for (const band of ['bass', 'mids', 'treble'] as const) {
        const [lo, hi] = bandBins[band];
        if (k >= lo && k < hi) energy[band] += p;
      }
    }
    bass[f] = Math.sqrt(energy.bass);
    mids[f] = Math.sqrt(energy.mids);
    treble[f] = Math.sqrt(energy.treble);

    for (let i = 0; i < FLUX_WINDOW; i += 1) {
      const idx = center - fluxHalf + i;
      fre[i] = (idx >= 0 && idx < samples.length ? samples[idx]! : 0) * fluxHann[i]!;
      fim[i] = 0;
    }
    fft(fre, fim);
    let fl = 0;
    for (let b = 0; b < FLUX_BANDS; b += 1) {
      let p = 0;
      for (let k = edges[b]!; k < Math.max(edges[b]! + 1, edges[b + 1]!); k += 1) p += fre[k]! * fre[k]! + fim[k]! * fim[k]!;
      bandLog[b] = Math.log1p(100 * Math.sqrt(p));
      if (f > 0) fl += Math.max(0, bandLog[b]! - prevBandLog[b]!);
    }
    prevBandLog.set(bandLog);
    flux[f] = fl;
  }

  const onsetEnv = normalize(highPass(flux, Math.round(400 / intervalMs)));
  const onsets = pickOnsets(onsetEnv, intervalMs);
  const tempo = estimateTempo(onsetEnv, intervalMs);
  const beats = tempo ? trackBeats(onsetEnv, tempo.periodFrames).map((f) => Math.round(f * intervalMs)) : [];

  const round = (a: Float64Array) => Array.from(a, (v) => Math.round(v * 1000) / 1000);
  return {
    schemaVersion: 1,
    audioAssetId: options.audioAssetId ?? null,
    audioHash: options.audioHash,
    durationMs,
    analysisVersion: MUSIC_ANALYSIS_VERSION,
    bpmEstimate: tempo ? Math.round(tempo.bpm * 10) / 10 : null,
    beatTimesMs: beats.filter((t, i, a) => t <= durationMs && (i === 0 || t > a[i - 1]!)),
    onsets: onsets.filter((o) => o.timeMs <= durationMs),
    features: {
      sampleIntervalMs: intervalMs,
      rms: round(normalize(compress(rms))),
      bass: round(normalize(compress(bass))),
      mids: round(normalize(compress(mids))),
      treble: round(normalize(compress(treble))),
    },
    sections: [],
  };
}

/** FFT radix-2 in-place. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a]! += tr;
        im[a]! += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Compressão perceptiva (aprox. dB) antes de normalizar. */
function compress(a: Float64Array): Float64Array {
  return a.map((v) => Math.log1p(1000 * v));
}

/** Escala para 0–1 pelo percentil 98 (picos isolados não achatam o resto). Silêncio → zeros. */
function normalize(a: Float64Array): Float64Array {
  const sorted = Float64Array.from(a).sort();
  const lo = sorted[Math.floor(sorted.length * 0.02)] ?? 0;
  const hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))] ?? 0;
  const range = hi - lo;
  if (!(range > 1e-9)) return new Float64Array(a.length);
  return a.map((v) => Math.min(1, Math.max(0, (v - lo) / range)));
}

/** Remove a média móvel e retifica (realça transientes sobre a dinâmica lenta). */
function highPass(a: Float64Array, radius: number): Float64Array {
  const out = new Float64Array(a.length);
  let sum = 0;
  let count = 0;
  let lo = 0;
  let hi = -1;
  for (let i = 0; i < a.length; i += 1) {
    while (hi < Math.min(a.length - 1, i + radius)) sum += a[++hi]!, count += 1;
    while (lo < i - radius) sum -= a[lo++]!, count -= 1;
    out[i] = Math.max(0, a[i]! - sum / count);
  }
  return out;
}

function pickOnsets(env: Float64Array, intervalMs: number): Array<{ timeMs: number; strength: number }> {
  const near = Math.max(1, Math.round(60 / intervalMs));
  const wide = Math.round(200 / intervalMs);
  const minGap = Math.round(80 / intervalMs);
  const out: Array<{ timeMs: number; strength: number }> = [];
  let last = -Infinity;
  for (let i = 0; i < env.length; i += 1) {
    const v = env[i]!;
    if (v < 0.15) continue;
    let isMax = true;
    for (let j = Math.max(0, i - near); j <= Math.min(env.length - 1, i + near); j += 1) {
      if (env[j]! > v || (env[j] === v && j < i)) {
        isMax = false;
        break;
      }
    }
    if (!isMax) continue;
    let mean = 0;
    let n = 0;
    for (let j = Math.max(0, i - wide); j <= Math.min(env.length - 1, i + wide); j += 1) mean += env[j]!, n += 1;
    if (v < mean / n + 0.07 || i - last < minGap) continue;
    out.push({ timeMs: Math.round(i * intervalMs), strength: Math.round(v * 1000) / 1000 });
    last = i;
  }
  return out;
}

function estimateTempo(env: Float64Array, intervalMs: number): { bpm: number; periodFrames: number } | null {
  const minLag = Math.floor(60_000 / MAX_BPM / intervalMs);
  const maxLag = Math.ceil(60_000 / MIN_BPM / intervalMs);
  if (env.length < maxLag * 3) return null;
  let mean = 0;
  for (const v of env) mean += v;
  mean /= env.length;
  const centered = env.map((v) => v - mean);
  let zero = 0;
  for (const v of centered) zero += v * v;
  if (zero <= 1e-9) return null;
  const ac = new Float64Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag += 1) {
    let s = 0;
    for (let i = lag; i < centered.length; i += 1) s += centered[i]! * centered[i - lag]!;
    ac[lag] = s / zero;
  }
  let best = -1;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const bpm = 60_000 / (lag * intervalMs);
    // Prior log-normal centrado em 120 BPM, 1 oitava de desvio (librosa).
    const prior = Math.exp(-0.5 * Math.log2(bpm / 120) ** 2);
    const score = ac[lag]! * prior;
    if (ac[lag]! > ac[lag - 1]! && ac[lag]! >= ac[lag + 1]! && score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  // Pulso fraco demais: BPM desconhecido permanece desconhecido.
  if (best < 0 || ac[best]! < 0.1) return null;
  const y0 = ac[best - 1]!;
  const y1 = ac[best]!;
  const y2 = ac[best + 1]!;
  const denom = y0 - 2 * y1 + y2;
  const periodFrames = best + (denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0);
  return { bpm: 60_000 / (periodFrames * intervalMs), periodFrames };
}

/** Programação dinâmica de Ellis: batidas fortes com espaçamento próximo do período. */
function trackBeats(env: Float64Array, period: number): number[] {
  const n = env.length;
  const tightness = 100;
  const score = new Float64Array(n);
  const back = new Int32Array(n).fill(-1);
  const lo = Math.round(period / 2);
  const hi = Math.round(period * 2);
  for (let t = 0; t < n; t += 1) {
    let best = 0;
    let arg = -1;
    for (let prev = t - hi; prev <= t - lo; prev += 1) {
      if (prev < 0) continue;
      const v = score[prev]! - tightness * Math.log((t - prev) / period) ** 2;
      if (arg < 0 || v > best) {
        best = v;
        arg = prev;
      }
    }
    score[t] = env[t]! + (arg >= 0 ? Math.max(0, best) : 0);
    back[t] = arg >= 0 && best > 0 ? arg : -1;
  }
  // Começa da melhor pontuação no último período e volta.
  let t = n - 1;
  for (let i = Math.max(0, n - Math.ceil(period)); i < n; i += 1) if (score[i]! > score[t]!) t = i;
  const beats: number[] = [];
  while (t >= 0) {
    beats.push(t);
    t = back[t]!;
  }
  beats.reverse();
  // Descarta batidas em silêncio nas pontas (envelope sem energia).
  let meanEnv = 0;
  for (const b of beats) meanEnv += env[b]!;
  meanEnv /= Math.max(1, beats.length);
  const strong = (b: number) => env[b]! >= meanEnv * 0.3;
  let first = 0;
  let last = beats.length - 1;
  while (first <= last && !strong(beats[first]!)) first += 1;
  while (last >= first && !strong(beats[last]!)) last -= 1;
  return beats.slice(first, last + 1);
}
