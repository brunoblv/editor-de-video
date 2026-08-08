import fsp from 'node:fs/promises';
import path from 'node:path';
import type {
  AmbientAudioLayer,
  AmbientAudioTimeline,
  AmbientConcept,
  AmbientPurpose,
  AmbientSoundEvent,
} from '@editor-video/core';
import { getStorage } from '@editor-video/core';
import { LicenseVerdict, prisma } from '@editor-video/db';
import { probe, runFfmpeg } from '../ffmpeg.js';
import { generateNoise } from './noise.js';
import { getPreset } from './presets.js';
import { chance, createRng, pickOne, randInt, randRange } from './rng.js';

/** Quantos eventos por passada de amix (evita filtergraph gigante). */
const EVENT_BATCH_SIZE = 28;

type LayerSynth = {
  kind: string;
  layerType: AmbientAudioLayer['layerType'];
  filter: string;
  defaultVolume: number;
  pan: number;
  noiseColor?: 'white' | 'pink' | 'brown';
};

const LAYER_SYNTH: Record<string, LayerSynth> = {
  rain: {
    kind: 'rain',
    layerType: 'base',
    filter: 'highpass=f=200,lowpass=f=8000,volume=0.9',
    defaultVolume: 0.45,
    pan: 0,
    noiseColor: 'pink',
  },
  roof_rain: {
    kind: 'roof_rain',
    layerType: 'texture',
    filter: 'highpass=f=400,lowpass=f=5000,volume=0.75',
    defaultVolume: 0.2,
    pan: 0.1,
    noiseColor: 'white',
  },
  fireplace: {
    kind: 'fireplace',
    layerType: 'environment',
    filter: 'highpass=f=80,lowpass=f=2500,tremolo=f=0.35:d=0.25,volume=0.7',
    defaultVolume: 0.15,
    pan: -0.25,
    noiseColor: 'pink',
  },
  wind: {
    kind: 'wind',
    layerType: 'texture',
    // tremolo exige f >= 0.1 no FFmpeg
    filter: 'lowpass=f=900,highpass=f=60,tremolo=f=0.12:d=0.4,volume=0.65',
    defaultVolume: 0.08,
    pan: 0.2,
    noiseColor: 'pink',
  },
  distant_thunder: {
    kind: 'distant_thunder',
    layerType: 'event',
    filter: 'lowpass=f=350,highpass=f=30,volume=0.55',
    defaultVolume: 0.12,
    pan: 0,
    noiseColor: 'brown',
  },
  forest: {
    kind: 'forest',
    layerType: 'environment',
    filter: 'bandpass=f=1200:width_type=h:width=1800,volume=0.55',
    defaultVolume: 0.35,
    pan: 0,
    noiseColor: 'pink',
  },
  ocean: {
    kind: 'ocean',
    layerType: 'base',
    filter: 'lowpass=f=700,tremolo=f=0.12:d=0.55,volume=0.8',
    defaultVolume: 0.75,
    pan: 0,
    noiseColor: 'brown',
  },
  room_ambience: {
    kind: 'room_ambience',
    layerType: 'environment',
    filter: 'lowpass=f=1200,volume=0.35',
    defaultVolume: 0.25,
    pan: 0,
    noiseColor: 'pink',
  },
  city_rain: {
    kind: 'city_rain',
    layerType: 'texture',
    filter: 'highpass=f=250,lowpass=f=6000,volume=0.6',
    defaultVolume: 0.25,
    pan: 0.15,
    noiseColor: 'white',
  },
  brown_noise: {
    kind: 'brown_noise',
    layerType: 'base',
    filter: 'volume=0.85',
    defaultVolume: 1,
    pan: 0,
    noiseColor: 'brown',
  },
  white_noise: {
    kind: 'white_noise',
    layerType: 'base',
    filter: 'volume=0.7',
    defaultVolume: 1,
    pan: 0,
    noiseColor: 'white',
  },
  pink_noise: {
    kind: 'pink_noise',
    layerType: 'base',
    filter: 'volume=0.75',
    defaultVolume: 1,
    pan: 0,
    noiseColor: 'pink',
  },
  wood_crack: {
    kind: 'wood_crack',
    layerType: 'event',
    filter: 'highpass=f=800,lowpass=f=4500,volume=0.5',
    defaultVolume: 0.2,
    pan: -0.15,
    noiseColor: 'white',
  },
  wind_gust: {
    kind: 'wind_gust',
    layerType: 'event',
    filter: 'lowpass=f=700,highpass=f=80,tremolo=f=0.25:d=0.55,volume=0.7',
    defaultVolume: 0.22,
    pan: 0.35,
    noiseColor: 'pink',
  },
  soft_foam: {
    kind: 'soft_foam',
    layerType: 'texture',
    filter: 'highpass=f=300,lowpass=f=4000,tremolo=f=0.15:d=0.35,volume=0.45',
    defaultVolume: 0.15,
    pan: 0.1,
    noiseColor: 'white',
  },
  crickets: {
    kind: 'crickets',
    layerType: 'texture',
    filter: 'bandpass=f=3500:width_type=h:width=2200,tremolo=f=0.4:d=0.3,volume=0.4',
    defaultVolume: 0.2,
    pan: 0.2,
    noiseColor: 'white',
  },
  leaves: {
    kind: 'leaves',
    layerType: 'texture',
    filter: 'highpass=f=500,lowpass=f=5000,tremolo=f=0.18:d=0.45,volume=0.4',
    defaultVolume: 0.15,
    pan: -0.15,
    noiseColor: 'pink',
  },
  owl: {
    kind: 'owl',
    layerType: 'event',
    filter: 'bandpass=f=600:width_type=h:width=400,volume=0.45',
    defaultVolume: 0.18,
    pan: -0.3,
    noiseColor: 'brown',
  },
  snow_wind: {
    kind: 'snow_wind',
    layerType: 'texture',
    filter: 'lowpass=f=600,highpass=f=80,tremolo=f=0.11:d=0.5,volume=0.55',
    defaultVolume: 0.2,
    pan: 0.15,
    noiseColor: 'pink',
  },
  train: {
    kind: 'train',
    layerType: 'base',
    filter: 'lowpass=f=400,tremolo=f=0.35:d=0.55,volume=0.7',
    defaultVolume: 0.45,
    pan: 0,
    noiseColor: 'brown',
  },
  train_horn: {
    kind: 'train_horn',
    layerType: 'event',
    filter: 'bandpass=f=280:width_type=h:width=180,volume=0.5',
    defaultVolume: 0.2,
    pan: 0,
    noiseColor: 'brown',
  },
  mountain_wind: {
    kind: 'mountain_wind',
    layerType: 'base',
    filter: 'lowpass=f=500,highpass=f=40,tremolo=f=0.12:d=0.5,volume=0.65',
    defaultVolume: 0.4,
    pan: 0.1,
    noiseColor: 'pink',
  },
};

function intensitySegments(
  durationSec: number,
  rng: () => number,
): AmbientAudioTimeline['intensitySegments'] {
  const segments: AmbientAudioTimeline['intensitySegments'] = [];
  let t = 0;
  while (t < durationSec) {
    const len = Math.min(durationSec - t, randRange(rng, 8 * 60, 18 * 60));
    const intensity = randRange(rng, 0.55, 1.05);
    segments.push({ startSec: t, endSec: t + len, intensity });
    t += len;
  }
  return segments;
}

function buildEvents(
  durationSec: number,
  eventDefs: Array<{
    type: string;
    minInterval: number;
    maxInterval: number;
    probability: number;
  }>,
  rng: () => number,
): AmbientSoundEvent[] {
  const events: AmbientSoundEvent[] = [];
  for (const def of eventDefs) {
    let t = randRange(rng, 15, Math.max(20, def.minInterval));
    while (t < durationSec - 5) {
      if (chance(rng, def.probability)) {
        const distanceRoll = rng();
        const distance =
          distanceRoll < 0.2 ? 'near' : distanceRoll < 0.55 ? 'medium' : 'distant';
        events.push({
          type: def.type === 'thunder' ? 'distant_thunder' : def.type,
          atSec: t,
          volume:
            distance === 'near'
              ? randRange(rng, 0.55, 0.85)
              : distance === 'medium'
                ? randRange(rng, 0.35, 0.6)
                : randRange(rng, 0.18, 0.4),
          pan: randRange(rng, -0.7, 0.7),
          distance,
        });
      }
      t += randRange(rng, def.minInterval, def.maxInterval);
    }
  }
  return events.sort((a, b) => a.atSec - b.atSec);
}

const LIBRARY_CATEGORIES: Record<string, string[]> = {
  rain: ['rain/light', 'rain/heavy', 'rain/window'],
  roof_rain: ['rain/roof', 'rain/heavy'],
  fireplace: ['fire/fireplace'],
  wind: ['wind/light', 'wind/strong'],
  wind_gust: ['wind/strong', 'wind/light'],
  distant_thunder: ['thunder/distant', 'thunder/close'],
  forest: ['nature/forest'],
  ocean: ['ocean/waves'],
  soft_foam: ['ocean/waves', 'ocean/foam'],
  room_ambience: ['room/ambience'],
  city_rain: ['city/rain'],
  brown_noise: ['noise/brown'],
  white_noise: ['noise/white'],
  pink_noise: ['noise/pink'],
  wood_crack: ['fire/wood', 'fire/fireplace'],
  crickets: ['nature/crickets', 'nature/forest'],
  leaves: ['nature/leaves', 'nature/forest'],
  owl: ['nature/owl', 'nature/forest'],
  snow_wind: ['wind/strong', 'wind/light'],
  train: ['train/ambience', 'train/rhythm'],
  train_horn: ['train/horn'],
  mountain_wind: ['wind/strong', 'nature/mountain'],
};

async function findLibraryAsset(
  kind: string,
  rng: () => number,
  excludeIds: Set<string>,
): Promise<{
  id: string;
  localKey: string;
  category: string;
} | null> {
  const categories = LIBRARY_CATEGORIES[kind] ?? [];
  if (categories.length === 0) return null;

  const baseWhere = {
    category: { in: categories },
    licenseVerdict: { in: [LicenseVerdict.SAFE, LicenseVerdict.ATTRIBUTION_REQUIRED] },
  };

  let candidates = await prisma.soundAsset.findMany({
    where: {
      ...baseWhere,
      verified: true,
      ...(excludeIds.size > 0 ? { id: { notIn: [...excludeIds] } } : {}),
    },
    orderBy: [{ qualityScore: 'desc' }, { loopScore: 'desc' }],
    take: 16,
  });

  if (candidates.length === 0) {
    candidates = await prisma.soundAsset.findMany({
      where: {
        ...baseWhere,
        ...(excludeIds.size > 0 ? { id: { notIn: [...excludeIds] } } : {}),
      },
      orderBy: [{ qualityScore: 'desc' }, { loopScore: 'desc' }],
      take: 16,
    });
  }

  // Se excluiu demais (poucos assets), volta a considerar todos.
  if (candidates.length === 0) {
    candidates = await prisma.soundAsset.findMany({
      where: baseWhere,
      orderBy: [{ qualityScore: 'desc' }, { loopScore: 'desc' }],
      take: 16,
    });
  }

  // Entre os top candidatos, sorteia (anti A-A-A entre projetos/camadas).
  const poolSize = Math.min(candidates.length, Math.max(3, Math.ceil(candidates.length * 0.6)));
  const pool = candidates.slice(0, poolSize);
  const asset = pickOne(rng, pool);
  if (!asset) return null;
  return { id: asset.id, localKey: asset.localKey, category: asset.category };
}

function stereoBalance(pan: number): number {
  return Math.max(-1, Math.min(1, pan));
}

/** Varia EQ/timbre por seed para beds sintéticos não soarem idênticos. */
function variedSynthFilter(kind: string, baseFilter: string, rng: () => number): string {
  const hp = Math.round(randRange(rng, 0.85, 1.2) * 100) / 100;
  const lp = Math.round(randRange(rng, 0.85, 1.15) * 100) / 100;
  let filter = baseFilter
    .replace(/highpass=f=(\d+)/g, (_, f: string) => `highpass=f=${Math.round(Number(f) * hp)}`)
    .replace(/lowpass=f=(\d+)/g, (_, f: string) => `lowpass=f=${Math.round(Number(f) * lp)}`);

  if (kind === 'rain' || kind === 'roof_rain' || kind === 'city_rain' || kind === 'forest') {
    const tone = randRange(rng, -2.5, 2.5).toFixed(2);
    filter += `,equalizer=f=2500:t=q:w=1.2:g=${tone}`;
  }
  if (kind === 'wind' || kind === 'wind_gust') {
    const rate = randRange(rng, 0.1, 0.22).toFixed(3);
    filter = filter.replace(/tremolo=f=[0-9.]+/, `tremolo=f=${rate}`);
  }
  return filter;
}

/**
 * Bed sintético curto sem fade nas pontas — fade no pedaço + stream_loop
 * gerava “buracos” a cada ~45s. Fade só no master completo.
 */
async function synthesizeBed(opts: {
  kind: string;
  workDir: string;
  volume: number;
  pan: number;
  rng: () => number;
  noiseSeed: number;
}): Promise<string> {
  const synth = LAYER_SYNTH[opts.kind] ?? LAYER_SYNTH.rain!;
  const rawPath = path.join(opts.workDir, `${opts.kind}-raw.wav`);
  const outPath = path.join(opts.workDir, `${opts.kind}-bed.wav`);

  await generateNoise({
    color: synth.noiseColor ?? 'pink',
    durationSec: 60,
    outputPath: rawPath,
    amplitude: randRange(opts.rng, 0.2, 0.32),
    seed: opts.noiseSeed,
  });

  const volume = opts.volume * randRange(opts.rng, 0.88, 1.12);
  const balance = stereoBalance(opts.pan + randRange(opts.rng, -0.12, 0.12));
  const filter = variedSynthFilter(opts.kind, synth.filter, opts.rng);
  const af =
    `${filter},volume=${volume.toFixed(3)},` +
    `stereotools=balance_in=${balance.toFixed(3)},` +
    `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo`;

  await runFfmpeg('ffmpeg', [
    '-y',
    '-i',
    rawPath,
    '-af',
    af,
    '-ac',
    '2',
    '-ar',
    '48000',
    '-c:a',
    'pcm_s16le',
    outPath,
  ]);

  await fsp.rm(rawPath, { force: true }).catch(() => undefined);
  return outPath;
}

/** Normaliza asset da library com offset/EQ distintos por seed. */
async function prepareLibraryBed(opts: {
  kind: string;
  localKey: string;
  workDir: string;
  volume: number;
  pan: number;
  rng: () => number;
}): Promise<string> {
  const storage = getStorage();
  const sourcePath = await storage.toLocalPath(opts.localKey);
  const outPath = path.join(opts.workDir, `${opts.kind}-bed.wav`);
  const info = await probe(sourcePath);
  const srcDur = Math.max(1, info.durationSec || 30);
  // Começa em ponto diferente do arquivo a cada projeto.
  const start =
    srcDur > 8 ? randRange(opts.rng, 0, Math.max(0.5, srcDur * 0.55)) : 0;
  const volume = opts.volume * randRange(opts.rng, 0.9, 1.1);
  const balance = stereoBalance(opts.pan + randRange(opts.rng, -0.1, 0.1));
  const tone = randRange(opts.rng, -2, 2).toFixed(2);
  const af =
    `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,` +
    `equalizer=f=2200:t=q:w=1.1:g=${tone},` +
    `volume=${volume.toFixed(3)},stereotools=balance_in=${balance.toFixed(3)}`;

  await runFfmpeg('ffmpeg', [
    '-y',
    '-ss',
    start.toFixed(3),
    '-i',
    sourcePath,
    '-af',
    af,
    '-ac',
    '2',
    '-ar',
    '48000',
    '-c:a',
    'pcm_s16le',
    outPath,
  ]);

  return outPath;
}

async function resolveBed(opts: {
  kind: string;
  workDir: string;
  volume: number;
  pan: number;
  library: { id: string; localKey: string; category: string } | null;
  rng: () => number;
  noiseSeed: number;
}): Promise<{ path: string; usedLibrary: boolean }> {
  if (opts.library) {
    try {
      const bedPath = await prepareLibraryBed({
        kind: opts.kind,
        localKey: opts.library.localKey,
        workDir: opts.workDir,
        volume: opts.volume,
        pan: opts.pan,
        rng: opts.rng,
      });
      return { path: bedPath, usedLibrary: true };
    } catch {
      // Fallback sintético se o arquivo da library estiver ausente/corrompido.
    }
  }
  return {
    path: await synthesizeBed({
      kind: opts.kind,
      workDir: opts.workDir,
      volume: opts.volume,
      pan: opts.pan,
      rng: opts.rng,
      noiseSeed: opts.noiseSeed,
    }),
    usedLibrary: false,
  };
}

async function synthesizeEventClip(opts: {
  event: AmbientSoundEvent;
  workDir: string;
  index: number;
  rng: () => number;
}): Promise<{ path: string; atSec: number }> {
  const kind = opts.event.type in LAYER_SYNTH ? opts.event.type : 'distant_thunder';
  const synth = LAYER_SYNTH[kind]!;
  const duration = kind.includes('thunder')
    ? randRange(opts.rng, 2.5, 5.5)
    : kind === 'wind_gust'
      ? randRange(opts.rng, 1.8, 4.5)
      : randRange(opts.rng, 0.4, 1.8);
  const outPath = path.join(opts.workDir, `event-${opts.index}.wav`);

  const reverb =
    opts.event.distance === 'distant'
      ? ',aecho=0.8:0.88:60:0.35'
      : opts.event.distance === 'medium'
        ? ',aecho=0.8:0.9:40:0.25'
        : '';

  const fadeOutSt = Math.max(0.1, duration - 0.8);
  const tail =
    `${reverb},volume=${opts.event.volume},` +
    `afade=t=in:st=0:d=0.15,afade=t=out:st=${fadeOutSt}:d=0.7,` +
    `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo`;

  const library = await findLibraryAsset(kind, opts.rng, new Set());
  if (library) {
    try {
      const sourcePath = await getStorage().toLocalPath(library.localKey);
      const info = await probe(sourcePath);
      const srcDur = Math.max(0.3, info.durationSec || duration);
      const start = Math.max(0, randRange(opts.rng, 0, Math.max(0.01, srcDur - duration)));
      const balance = stereoBalance(opts.event.pan);
      await runFfmpeg('ffmpeg', [
        '-y',
        '-ss',
        start.toFixed(3),
        '-t',
        String(duration),
        '-i',
        sourcePath,
        '-af',
        `stereotools=balance_in=${balance.toFixed(3)}${tail}`,
        '-ac',
        '2',
        '-ar',
        '48000',
        '-c:a',
        'pcm_s16le',
        outPath,
      ]);
      return { path: outPath, atSec: opts.event.atSec };
    } catch {
      // segue para síntese
    }
  }

  const rawPath = path.join(opts.workDir, `event-${opts.index}-raw.wav`);
  await generateNoise({
    color: synth.noiseColor ?? 'brown',
    durationSec: duration,
    outputPath: rawPath,
    amplitude: randRange(opts.rng, 0.28, 0.4),
    seed: randInt(opts.rng, 1, 2_000_000_000),
  });

  await runFfmpeg('ffmpeg', [
    '-y',
    '-i',
    rawPath,
    '-af',
    `${synth.filter}${tail}`,
    '-ac',
    '2',
    '-ar',
    '48000',
    '-c:a',
    'pcm_s16le',
    outPath,
  ]);

  await fsp.rm(rawPath, { force: true }).catch(() => undefined);
  return { path: outPath, atSec: opts.event.atSec };
}

/** Mistura beds (loop contínuo). Preview curto em WAV; longo em chunks AAC. */
async function mixBeds(opts: {
  bedPaths: string[];
  durationSec: number;
  workDir: string;
  intensity?: number;
  outputPath?: string;
  codec: 'pcm' | 'aac';
}): Promise<string> {
  const outPath =
    opts.outputPath ??
    path.join(opts.workDir, opts.codec === 'aac' ? 'beds-mix.m4a' : 'beds-mix.wav');
  const inputs: string[] = [];
  for (const bed of opts.bedPaths) {
    inputs.push('-stream_loop', '-1', '-t', String(opts.durationSec), '-i', bed);
  }

  const fadeOut = Math.max(0, opts.durationSec - 3);
  const intensity = opts.intensity ?? 1;
  const filterParts: string[] = [];
  const labels: string[] = [];
  for (let i = 0; i < opts.bedPaths.length; i++) {
    filterParts.push(
      `[${i}:a]afade=t=in:st=0:d=2,afade=t=out:st=${fadeOut}:d=3,volume=${intensity.toFixed(3)}[b${i}]`,
    );
    labels.push(`[b${i}]`);
  }

  const filterComplex =
    opts.bedPaths.length === 1
      ? `${filterParts[0]};[b0]anull[mixed]`
      : `${filterParts.join(';')};${labels.join('')}amix=inputs=${labels.length}:duration=first:dropout_transition=2:normalize=0[mixed]`;

  const codecArgs =
    opts.codec === 'aac'
      ? (['-c:a', 'aac', '-b:a', '256k'] as const)
      : (['-c:a', 'pcm_s16le'] as const);

  await runFfmpeg('ffmpeg', [
    '-y',
    ...inputs,
    '-filter_complex',
    filterComplex,
    '-map',
    '[mixed]',
    '-t',
    String(opts.durationSec),
    '-ac',
    '2',
    '-ar',
    '48000',
    ...codecArgs,
    outPath,
  ]);

  return outPath;
}

/**
 * Soma eventos em lotes. Para masters longos, trabalha em janelas AAC
 * sem reescrever a trilha PCM completa várias vezes.
 */
async function mixEventsInBatches(opts: {
  basePath: string;
  eventClips: Array<{ path: string; atSec: number }>;
  durationSec: number;
  workDir: string;
  codec: 'pcm' | 'aac';
}): Promise<string> {
  if (opts.eventClips.length === 0) return opts.basePath;

  let current = opts.basePath;
  let batchIdx = 0;
  const ext = opts.codec === 'aac' ? 'm4a' : 'wav';
  const codecArgs =
    opts.codec === 'aac'
      ? (['-c:a', 'aac', '-b:a', '256k'] as const)
      : (['-c:a', 'pcm_s16le'] as const);

  for (let offset = 0; offset < opts.eventClips.length; offset += EVENT_BATCH_SIZE) {
    const batch = opts.eventClips.slice(offset, offset + EVENT_BATCH_SIZE);
    const outPath = path.join(opts.workDir, `mix-batch-${batchIdx}.${ext}`);
    const inputs = ['-i', current];
    for (const clip of batch) {
      inputs.push('-i', clip.path);
    }

    const filterParts: string[] = [];
    const labels = ['[0:a]'];
    for (let e = 0; e < batch.length; e++) {
      const delayMs = Math.round(batch[e]!.atSec * 1000);
      filterParts.push(`[${e + 1}:a]adelay=${delayMs}|${delayMs},apad[e${e}]`);
      labels.push(`[e${e}]`);
    }

    const filterComplex =
      filterParts.join(';') +
      `;${labels.join('')}amix=inputs=${labels.length}:duration=first:dropout_transition=2:normalize=0[mixed]`;

    await runFfmpeg('ffmpeg', [
      '-y',
      ...inputs,
      '-filter_complex',
      filterComplex,
      '-map',
      '[mixed]',
      '-t',
      String(opts.durationSec),
      '-ac',
      '2',
      '-ar',
      '48000',
      ...codecArgs,
      outPath,
    ]);

    if (current !== opts.basePath) {
      await fsp.rm(current, { force: true }).catch(() => undefined);
    }
    current = outPath;
    batchIdx += 1;
  }

  return current;
}

const LONG_CHUNK_SEC = 600; // 10 min — evita WAV multi-GB

function intensityAt(
  segments: AmbientAudioTimeline['intensitySegments'],
  startSec: number,
  endSec: number,
): number {
  if (segments.length === 0) return 1;
  let weighted = 0;
  let covered = 0;
  for (const seg of segments) {
    const a = Math.max(startSec, seg.startSec);
    const b = Math.min(endSec, seg.endSec);
    if (b > a) {
      weighted += seg.intensity * (b - a);
      covered += b - a;
    }
  }
  return covered > 0 ? weighted / covered : 1;
}

/** Render longo: chunks AAC independentes + concat (sem WAV full-duration). */
async function mixLongSoundscape(opts: {
  bedPaths: string[];
  eventClips: Array<{ path: string; atSec: number }>;
  durationSec: number;
  workDir: string;
  intensitySegments: AmbientAudioTimeline['intensitySegments'];
}): Promise<string> {
  const chunkPaths: string[] = [];
  for (let start = 0; start < opts.durationSec; start += LONG_CHUNK_SEC) {
    const len = Math.min(LONG_CHUNK_SEC, opts.durationSec - start);
    const intensity = intensityAt(opts.intensitySegments, start, start + len);
    const eventsInChunk = opts.eventClips
      .filter((e) => e.atSec >= start && e.atSec < start + len)
      .map((e) => ({ path: e.path, atSec: e.atSec - start }));

    const bedsPath = await mixBeds({
      bedPaths: opts.bedPaths,
      durationSec: len,
      workDir: opts.workDir,
      intensity,
      outputPath: path.join(opts.workDir, `chunk-beds-${start}.m4a`),
      codec: 'aac',
    });

    const mixed = await mixEventsInBatches({
      basePath: bedsPath,
      eventClips: eventsInChunk,
      durationSec: len,
      workDir: opts.workDir,
      codec: 'aac',
    });

    const chunkOut = path.join(opts.workDir, `chunk-${start}.m4a`);
    if (mixed !== bedsPath) {
      await fsp.rename(mixed, chunkOut).catch(async () => {
        await fsp.copyFile(mixed, chunkOut);
        await fsp.rm(mixed, { force: true });
      });
    } else {
      await fsp.rename(bedsPath, chunkOut).catch(async () => {
        await fsp.copyFile(bedsPath, chunkOut);
      });
    }
    if (mixed !== bedsPath) {
      await fsp.rm(bedsPath, { force: true }).catch(() => undefined);
    }
    chunkPaths.push(chunkOut);
  }

  const listPath = path.join(opts.workDir, 'chunks.txt');
  await fsp.writeFile(
    listPath,
    chunkPaths.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'),
    'utf8',
  );

  const concatPath = path.join(opts.workDir, 'audio-concat.m4a');
  await runFfmpeg('ffmpeg', [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-c',
    'copy',
    concatPath,
  ]);

  return concatPath;
}

function masterFilter(profile: AmbientPurpose): string {
  switch (profile) {
    case 'sleep':
      return 'loudnorm=I=-20:TP=-2.5:LRA=6,alimiter=limit=0.95';
    case 'study':
      return 'loudnorm=I=-18:TP=-2:LRA=5,alimiter=limit=0.95';
    case 'immersive':
      return 'loudnorm=I=-16:TP=-1.5:LRA=9,alimiter=limit=0.97';
    default:
      return 'loudnorm=I=-18:TP=-2:LRA=7,alimiter=limit=0.95';
  }
}

export async function buildSoundscape(opts: {
  concept: AmbientConcept;
  presetId: string | null;
  seed: number;
  durationSec: number;
  workDir: string;
  /** Volumes da variação Midnight (sobrescreve preset base). */
  layerVolumes?: Record<string, number>;
  /** Eventos da variação Midnight. */
  eventDefs?: Array<{
    type: string;
    minInterval: number;
    maxInterval: number;
    probability: number;
  }>;
}): Promise<{ timeline: AmbientAudioTimeline; masterPath: string }> {
  const rng = createRng(opts.seed);
  const preset = getPreset(opts.presetId);
  const volumes = { ...preset.layerVolumes, ...(opts.layerVolumes ?? {}) };
  if (opts.eventDefs) {
    preset.events = opts.eventDefs;
  }
  const layers: AmbientAudioLayer[] = [];
  const bedPaths: string[] = [];
  const usedAssetIds = new Set<string>();
  const segments = intensitySegments(opts.durationSec, rng);

  for (const [layerIndex, kind] of opts.concept.audioLayers.entries()) {
    const synth = LAYER_SYNTH[kind] ?? LAYER_SYNTH.rain!;
    const volume = volumes[kind] ?? synth.defaultVolume;
    const library = await findLibraryAsset(kind, rng, usedAssetIds);
    if (library) usedAssetIds.add(library.id);

    const bed = await resolveBed({
      kind,
      workDir: opts.workDir,
      volume,
      pan: synth.pan,
      library,
      rng,
      noiseSeed: (opts.seed + (layerIndex + 1) * 9973) >>> 0,
    });
    bedPaths.push(bed.path);

    layers.push({
      id: kind,
      kind,
      layerType: synth.layerType,
      volume,
      pan: synth.pan,
      source: bed.usedLibrary
        ? 'library'
        : kind.includes('noise')
          ? 'noise'
          : 'synthetic',
      category: bed.usedLibrary ? library?.category : undefined,
      assetId: bed.usedLibrary ? library?.id : undefined,
    });
  }

  if (bedPaths.length === 0) {
    const fallback = await synthesizeBed({
      kind: 'rain',
      workDir: opts.workDir,
      volume: 0.7,
      pan: 0,
      rng,
      noiseSeed: opts.seed >>> 0,
    });
    bedPaths.push(fallback);
    layers.push({
      id: 'rain',
      kind: 'rain',
      layerType: 'base',
      volume: 0.7,
      pan: 0,
      source: 'synthetic',
    });
  }

  const events = buildEvents(opts.durationSec, preset.events, rng);
  const eventClips: Array<{ path: string; atSec: number }> = [];
  for (let i = 0; i < events.length; i++) {
    eventClips.push(
      await synthesizeEventClip({
        event: events[i]!,
        workDir: opts.workDir,
        index: i,
        rng,
      }),
    );
  }

  const isLong = opts.durationSec > 120;
  let mixPath: string;

  if (isLong) {
    mixPath = await mixLongSoundscape({
      bedPaths,
      eventClips,
      durationSec: opts.durationSec,
      workDir: opts.workDir,
      intensitySegments: segments,
    });
  } else {
    const avgIntensity =
      segments.reduce((s, seg) => s + seg.intensity, 0) / Math.max(1, segments.length);
    const bedsMixPath = await mixBeds({
      bedPaths,
      durationSec: opts.durationSec,
      workDir: opts.workDir,
      intensity: avgIntensity,
      codec: 'pcm',
    });
    mixPath = await mixEventsInBatches({
      basePath: bedsMixPath,
      eventClips,
      durationSec: opts.durationSec,
      workDir: opts.workDir,
      codec: 'pcm',
    });
  }

  const masterPath = isLong
    ? path.join(opts.workDir, 'audio-master.m4a')
    : path.join(opts.workDir, 'audio-master.wav');

  const masterCodec = isLong
    ? (['-c:a', 'aac', '-b:a', '256k'] as const)
    : (['-c:a', 'pcm_s16le'] as const);

  await runFfmpeg('ffmpeg', [
    '-y',
    '-i',
    mixPath,
    '-af',
    masterFilter(opts.concept.purpose),
    '-ac',
    '2',
    '-ar',
    '48000',
    ...masterCodec,
    masterPath,
  ]);

  await fsp.rm(mixPath, { force: true }).catch(() => undefined);

  const timeline: AmbientAudioTimeline = {
    seed: opts.seed,
    durationSec: opts.durationSec,
    layers,
    events,
    intensitySegments: segments,
  };

  return { timeline, masterPath };
}

