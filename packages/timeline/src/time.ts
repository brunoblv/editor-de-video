/**
 * Aritmética temporal da timeline V3 (docs/especificacao-v3-hub-editor-ia.md §8).
 *
 * Todo tempo é um inteiro numa timebase racional declarada (ex.: 30000/1001
 * frames por segundo). Intervalos são [in, out) — final exclusivo. Nunca
 * acumulamos floats para posicionar cortes: conversões entre timebases são
 * feitas por multiplicação inteira e um único arredondamento no fim.
 */

/** Taxa racional: `num/den` unidades por segundo (ex.: 30000/1001 fps, 48000/1 Hz). */
export type Rate = { num: number; den: number };

export function rate(num: number, den = 1): Rate {
  if (!Number.isInteger(num) || !Number.isInteger(den) || num <= 0 || den <= 0) {
    throw new Error(`Taxa inválida: ${num}/${den}`);
  }
  return { num, den };
}

export function rateEquals(a: Rate, b: Rate): boolean {
  return a.num * b.den === b.num * a.den;
}

export function rateToNumber(r: Rate): number {
  return r.num / r.den;
}

/**
 * Divisão inteira com arredondamento "half away from zero", em BigInt para
 * não perder precisão em vídeos longos (10h a 60fps × fatores de taxa).
 */
function divRound(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n * 2n + d) / (d * 2n);
  return negative ? -q : q;
}

/** Converte `units` de uma timebase para outra com um único arredondamento. */
export function rescale(units: number, from: Rate, to: Rate): number {
  if (!Number.isInteger(units)) throw new Error(`Tempo não inteiro: ${units}`);
  if (rateEquals(from, to)) return units;
  // units / (from.num/from.den) segundos × (to.num/to.den) = units·from.den·to.num / (from.num·to.den)
  const result = divRound(
    BigInt(units) * BigInt(from.den) * BigInt(to.num),
    BigInt(from.num) * BigInt(to.den),
  );
  return Number(result);
}

/** Segundos (para FFmpeg/players) a partir de unidades inteiras. Só para saída. */
export function toSeconds(units: number, r: Rate): number {
  return (units * r.den) / r.num;
}

/** Unidades inteiras a partir de segundos (entrada humana/ffprobe), arredondando uma vez. */
export function fromSeconds(seconds: number, r: Rate): number {
  return Math.round((seconds * r.num) / r.den);
}

/**
 * Duração na timeline de um trecho de fonte [sourceIn, sourceOut) tocado a
 * `playbackRate` (2/1 = duas vezes mais rápido).
 */
export function clipTimelineDuration(
  sourceIn: number,
  sourceOut: number,
  sourceRate: Rate,
  timelineRate: Rate,
  playbackRate: Rate = { num: 1, den: 1 },
): number {
  const length = sourceOut - sourceIn;
  // Tocar mais rápido equivale a uma fonte com taxa multiplicada por playbackRate.
  const effective: Rate = {
    num: sourceRate.num * playbackRate.num,
    den: sourceRate.den * playbackRate.den,
  };
  return rescale(length, effective, timelineRate);
}

/** Timecode HH:MM:SS:FF (não drop-frame) para exibição. */
export function formatTimecode(frames: number, fps: Rate): string {
  const nominal = Math.round(rateToNumber(fps));
  const ff = frames % nominal;
  const totalSeconds = Math.floor(frames / nominal);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

export type Interval = { start: number; end: number };

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}
