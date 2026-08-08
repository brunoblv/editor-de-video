import { config } from '@editor-video/core';
import type { AmbientAudioTimeline, AmbientVisualTimeline } from '@editor-video/core';
import { probe, runFfmpeg } from '../ffmpeg.js';

export type QualityReport = {
  audioQuality: number;
  loopQuality: number;
  atmosphere: number;
  visualQuality: number;
  licenseSafety: number;
  total: number;
  passed: boolean;
  notes: string[];
  measurements?: {
    audioDurationSec?: number;
    audioPeakDb?: number;
    hasSilence?: boolean;
    videoDurationSec?: number;
    videoWidth?: number;
    videoHeight?: number;
  };
};

async function detectClipping(audioPath: string): Promise<{ clipping: boolean; peakDb: number | null }> {
  try {
    const { stderr } = await runFfmpeg('ffmpeg', [
      '-i',
      audioPath,
      '-af',
      'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level',
      '-f',
      'null',
      '-',
    ]);
    const peaks = [...stderr.matchAll(/Peak_level=(-?[\d.]+)/g)].map((m) => Number(m[1]));
    const peakDb = peaks.length ? Math.max(...peaks.filter(Number.isFinite)) : null;
    return {
      clipping: peakDb !== null && peakDb >= -0.2,
      peakDb,
    };
  } catch {
    return { clipping: false, peakDb: null };
  }
}

async function detectSilence(audioPath: string): Promise<boolean> {
  try {
    const { stderr } = await runFfmpeg('ffmpeg', [
      '-i',
      audioPath,
      '-af',
      'silencedetect=noise=-40dB:d=2',
      '-f',
      'null',
      '-',
    ]);
    return /silence_start/.test(stderr);
  } catch {
    return false;
  }
}

async function detectBlackFrames(videoPath: string): Promise<boolean> {
  try {
    const { stderr } = await runFfmpeg('ffmpeg', [
      '-i',
      videoPath,
      '-vf',
      'blackdetect=d=0.5:pix_th=0.10',
      '-an',
      '-f',
      'null',
      '-',
    ]);
    return /black_start/.test(stderr);
  } catch {
    return false;
  }
}

export async function runQualityCheck(opts: {
  audioPath: string;
  visualPath: string;
  outputPath?: string;
  expectedDurationSec: number;
  audioTimeline: AmbientAudioTimeline;
  visualTimeline: AmbientVisualTimeline;
  licenseSafe: boolean;
}): Promise<QualityReport> {
  const notes: string[] = [];
  let audioQuality = 90;
  let loopQuality = 70;
  let atmosphere = 70;
  let visualQuality = 70;
  const licenseSafety = opts.licenseSafe ? 100 : 20;

  const measurements: NonNullable<QualityReport['measurements']> = {};

  const audioInfo = await probe(opts.audioPath);
  measurements.audioDurationSec = audioInfo.durationSec;

  if (Math.abs(audioInfo.durationSec - opts.expectedDurationSec) > 2) {
    audioQuality -= 15;
    notes.push('Duração do áudio diverge do planejado.');
  }
  if (!audioInfo.hasAudio) {
    audioQuality = 20;
    notes.push('Áudio ausente.');
  }

  const { clipping, peakDb } = await detectClipping(opts.audioPath);
  measurements.audioPeakDb = peakDb ?? undefined;
  if (clipping) {
    audioQuality -= 25;
    notes.push('Clipping detectado no áudio.');
  }

  const hasSilence = await detectSilence(opts.audioPath);
  measurements.hasSilence = hasSilence;
  if (hasSilence) {
    audioQuality -= 12;
    notes.push('Trechos de silêncio detectados.');
  }

  if (opts.audioTimeline.layers.length < 2) {
    atmosphere -= 10;
    notes.push('Poucas camadas no soundscape.');
  } else {
    atmosphere += Math.min(15, opts.audioTimeline.layers.length * 3);
  }

  if (opts.audioTimeline.events.length > 0) {
    atmosphere += 5;
  }

  if (opts.audioTimeline.intensitySegments.length > 1) {
    atmosphere += 5;
    loopQuality += 5;
  }

  const visualInfo = await probe(opts.visualPath);
  measurements.videoDurationSec = visualInfo.durationSec;
  measurements.videoWidth = visualInfo.width;
  measurements.videoHeight = visualInfo.height;

  if (visualInfo.width < 1280 || visualInfo.height < 720) {
    visualQuality -= 15;
    notes.push('Resolução visual abaixo de 720p.');
  } else if (visualInfo.width >= 1080 && visualInfo.height >= 1080) {
    visualQuality += 8;
  }

  if (opts.visualTimeline.clips.some((c) => c.provider)) {
    visualQuality += 8;
  } else {
    visualQuality -= 5;
    notes.push('Visual sintético (sem stock).');
  }

  if (await detectBlackFrames(opts.visualPath)) {
    visualQuality -= 10;
    notes.push('Black frames detectados.');
  }

  // Loop: visual curto deve ser menor que o áudio (estratégia de loop).
  if (visualInfo.durationSec > 0 && visualInfo.durationSec <= 60) {
    loopQuality += 15;
  } else {
    loopQuality -= 5;
  }

  if (opts.outputPath) {
    const out = await probe(opts.outputPath);
    if (Math.abs(out.durationSec - opts.expectedDurationSec) > 3) {
      audioQuality -= 10;
      notes.push('Duração final diverge.');
    }
  }

  if (!opts.licenseSafe) {
    notes.push('Licença insegura nos assets.');
  }

  audioQuality = clamp(audioQuality);
  loopQuality = clamp(loopQuality);
  atmosphere = clamp(atmosphere);
  visualQuality = clamp(visualQuality);

  const total = Math.round(
    audioQuality * 0.3 +
      loopQuality * 0.2 +
      atmosphere * 0.2 +
      visualQuality * 0.15 +
      licenseSafety * 0.15,
  );

  return {
    audioQuality,
    loopQuality,
    atmosphere,
    visualQuality,
    licenseSafety,
    total,
    passed: total >= config.ambient.qualityThreshold && licenseSafety >= 80,
    notes,
    measurements,
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
