import fsp from 'node:fs/promises';
import path from 'node:path';
import { getStorage, storageKeys } from '@editor-video/core';
import { LicenseVerdict, prisma } from '@editor-video/db';
import { probe, runFfmpeg } from '../ffmpeg.js';
import { evaluateLicense } from './license-guard.js';

export type ImportSoundInput = {
  name: string;
  category: string;
  subcategory?: string;
  provider: string;
  sourceUrl?: string;
  license?: string;
  licenseUrl?: string;
  attribution?: string;
  tags?: string[];
  filePath: string;
};

/** download → FFprobe → análise → score → biblioteca */
export async function importSoundAsset(input: ImportSoundInput): Promise<string> {
  const info = await probe(input.filePath);
  const decision = evaluateLicense({
    provider: input.provider,
    sourceUrl: input.sourceUrl,
    license: input.license,
    licenseUrl: input.licenseUrl,
    author: input.attribution,
  });

  if (decision.verdict === LicenseVerdict.UNKNOWN || decision.verdict === LicenseVerdict.REJECTED) {
    throw new Error(`License Guard: ${decision.reason}`);
  }

  let lufs: number | null = null;
  let peak: number | null = null;
  try {
    const { stderr } = await runFfmpeg('ffmpeg', [
      '-i',
      input.filePath,
      '-af',
      'loudnorm=print_format=json',
      '-f',
      'null',
      '-',
    ]);
    const match = stderr.match(/\{[\s\S]*"input_i"\s*:\s*"([^"]+)"[\s\S]*?\}/);
    if (match) {
      const jsonStart = stderr.lastIndexOf('{');
      const jsonEnd = stderr.lastIndexOf('}');
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        const parsed = JSON.parse(stderr.slice(jsonStart, jsonEnd + 1)) as {
          input_i?: string;
          input_tp?: string;
        };
        lufs = Number(parsed.input_i);
        peak = Number(parsed.input_tp);
      }
    }
  } catch {
    // análise de loudness é best-effort
  }

  const qualityScore = scoreTechnical({
    durationSec: info.durationSec,
    hasAudio: info.hasAudio,
  });
  const loopScore = scoreLoop(info.durationSec);

  const ext = path.extname(input.filePath) || '.wav';
  const asset = await prisma.soundAsset.create({
    data: {
      name: input.name,
      category: input.category,
      subcategory: input.subcategory,
      provider: input.provider,
      sourceUrl: input.sourceUrl,
      localKey: 'pending',
      durationSec: info.durationSec,
      license: input.license,
      licenseUrl: input.licenseUrl,
      attribution: input.attribution,
      commercialUse: decision.commercialUse,
      modificationAllowed: decision.modificationAllowed,
      attributionRequired: decision.attributionRequired,
      verified: decision.verified,
      licenseVerdict: decision.verdict,
      tags: input.tags ?? [],
      qualityScore,
      loopScore,
      lufs: Number.isFinite(lufs) ? lufs : null,
      peak: Number.isFinite(peak) ? peak : null,
    },
  });

  const localKey = storageKeys.soundAsset(asset.id, ext);
  const storage = getStorage();
  await storage.put(localKey, await fsp.readFile(input.filePath));
  await prisma.soundAsset.update({
    where: { id: asset.id },
    data: { localKey },
  });

  return asset.id;
}

function scoreTechnical(opts: { durationSec: number; hasAudio: boolean }): number {
  let score = 50;
  if (!opts.hasAudio) return 0;
  if (opts.durationSec >= 10) score += 20;
  if (opts.durationSec >= 30) score += 10;
  if (opts.durationSec >= 60) score += 10;
  return Math.min(100, score);
}

function scoreLoop(durationSec: number): number {
  // Trechos longos e contínuos tendem a loopar melhor
  if (durationSec >= 60) return 90;
  if (durationSec >= 30) return 80;
  if (durationSec >= 15) return 70;
  if (durationSec >= 5) return 55;
  return 35;
}
