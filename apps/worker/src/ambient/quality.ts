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
};

async function detectClipping(audioPath: string): Promise<boolean> {
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
    return peaks.some((p) => Number.isFinite(p) && p >= -0.2);
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
  let loopQuality = 88;
  let atmosphere = 85;
  let visualQuality = 85;
  const licenseSafety = opts.licenseSafe ? 100 : 40;

  const audioInfo = await probe(opts.audioPath);
  if (Math.abs(audioInfo.durationSec - opts.expectedDurationSec) > 2) {
    audioQuality -= 15;
    notes.push('Duração do áudio diverge do planejado.');
  }
  if (!audioInfo.hasAudio) {
    audioQuality = 20;
    notes.push('Áudio ausente.');
  }

  const clipping = await detectClipping(opts.audioPath);
  if (clipping) {
    audioQuality -= 25;
    notes.push('Possível clipping detectado.');
  }

  if (opts.audioTimeline.layers.length < 2 && !opts.audioTimeline.layers.some((l) => l.kind.includes('noise'))) {
    atmosphere -= 10;
    notes.push('Poucas camadas no soundscape.');
  } else {
    atmosphere += Math.min(10, opts.audioTimeline.layers.length * 2);
  }

  if (opts.audioTimeline.events.length > 0) {
    atmosphere += 4;
    loopQuality += 3;
  }

  const visualInfo = await probe(opts.visualPath);
  if (visualInfo.width < 1280 || visualInfo.height < 720) {
    visualQuality -= 15;
    notes.push('Resolução visual abaixo de 720p.');
  } else if (visualInfo.width >= 1920) {
    visualQuality += 5;
  }

  if (opts.visualTimeline.clips.some((c) => c.provider)) {
    visualQuality += 5;
  } else {
    visualQuality -= 8;
    notes.push('Visual sintético (sem stock).');
  }

  if (opts.outputPath) {
    const out = await probe(opts.outputPath);
    if (Math.abs(out.durationSec - opts.expectedDurationSec) > 3) {
      audioQuality -= 10;
      notes.push('Duração final diverge.');
    }
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
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
