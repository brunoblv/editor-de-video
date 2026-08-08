import { runFfmpeg } from '../ffmpeg.js';

export type NoiseColor = 'white' | 'pink' | 'brown';

/** Gera ruído local (não requer asset externo). */
export async function generateNoise(opts: {
  color: NoiseColor;
  durationSec: number;
  outputPath: string;
  amplitude?: number;
  /** Seed do anoisesrc — sem isso o FFmpeg gera a mesma sequência. */
  seed?: number;
}): Promise<void> {
  const amp = opts.amplitude ?? 0.2;
  const seed =
    opts.seed != null && Number.isFinite(opts.seed)
      ? Math.abs(Math.floor(opts.seed)) % 4294967296
      : Math.floor(Math.random() * 4294967296);
  await runFfmpeg('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `anoisesrc=color=${opts.color}:amplitude=${amp}:sample_rate=48000:duration=${opts.durationSec}:seed=${seed}`,
    '-ac',
    '2',
    '-c:a',
    'pcm_s16le',
    opts.outputPath,
  ]);
}
