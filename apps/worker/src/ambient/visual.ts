import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  getMidnightRecipe,
  type AmbientConcept,
  type AmbientVisualTimeline,
} from '@editor-video/core';
import { runFfmpeg } from '../ffmpeg.js';
import { downloadFile } from '../v2/download.js';
import { searchBestStockLandscape } from './media-search-landscape.js';
import { getAmbientRenderProfile } from './render-profile.js';

/** Args de vídeo enxutos para Ambient (longo / loopável). */
const AMBIENT_X264 = [
  '-c:v',
  'libx264',
  '-preset',
  'veryfast',
  '-crf',
  '26',
  '-maxrate',
  '3M',
  '-bufsize',
  '6M',
  '-pix_fmt',
  'yuv420p',
] as const;

/**
 * Gera um Visual Master curto (loopável) + opcionalmente estende/mux com áudio.
 * Estratégia eficiente da spec §22: visual curto + audio master → loop → mux.
 */
export async function buildVisualMaster(opts: {
  concept: AmbientConcept;
  workDir: string;
  masterDurationSec: number;
  autoSearch?: boolean;
}): Promise<{ timeline: AmbientVisualTimeline; visualMasterPath: string }> {
  const profile = getAmbientRenderProfile(opts.concept.format);
  const { width, height, fps } = profile;
  const loopSec = Math.min(45, Math.max(20, opts.masterDurationSec));
  const queries = opts.concept.visualQueries.length
    ? opts.concept.visualQueries
    : [`${opts.concept.environment} ${opts.concept.weather} ${opts.concept.time}`];

  const usedUrls = new Set<string>();
  const clips: AmbientVisualTimeline['clips'] = [];
  const mediaDir = path.join(opts.workDir, 'visual-media');
  await fsp.mkdir(mediaDir, { recursive: true });

  const clipPaths: string[] = [];
  const autoSearch = opts.autoSearch !== false;

  if (autoSearch) {
    try {
      for (const [index, query] of queries.slice(0, 2).entries()) {
        const hit = await searchBestStockLandscape(query, usedUrls);
        usedUrls.add(hit.downloadUrl);
        usedUrls.add(hit.sourceUrl);

        const ext = path.extname(new URL(hit.downloadUrl).pathname) || '.mp4';
        const rawPath = path.join(mediaDir, `raw-${index}${ext}`);
        await downloadFile(hit.downloadUrl, rawPath);

        clips.push({
          query,
          provider: hit.provider,
          sourceUrl: hit.sourceUrl,
          localFile: rawPath,
          durationSec: hit.durationSec,
          author: hit.author ?? undefined,
          license: hit.license,
        });
        clipPaths.push(rawPath);
      }
    } catch {
      clips.push({
        query: queries[0] ?? 'ambient',
        durationSec: loopSec,
      });
    }
  } else {
    clips.push({
      query: queries[0] ?? 'ambient',
      durationSec: loopSec,
    });
  }

  const visualMasterPath = path.join(opts.workDir, 'visual-master.mp4');
  const recipe = getMidnightRecipe(opts.concept.recipeId);
  const rainOverlay =
    recipe.visualEffects.rainOverlay ||
    /rain|thunder|storm/i.test(`${opts.concept.weather} ${opts.concept.audioLayers.join(' ')}`);
  const lightFlicker =
    recipe.visualEffects.lightFlicker || opts.concept.environment === 'cabin';
  const slowZoom = recipe.visualEffects.slowZoom !== false;

  const effectChain = buildEffectFilters({
    width,
    height,
    fps,
    rainOverlay,
    lightFlicker,
    slowZoom,
  });

  if (clipPaths.length >= 2) {
    // Crossfade A↔B num loop curto.
    const half = loopSec / 2;
    const xfadeDur = Math.min(1.5, half / 4);
    await runFfmpeg('ffmpeg', [
      '-y',
      '-stream_loop',
      '-1',
      '-i',
      clipPaths[0]!,
      '-stream_loop',
      '-1',
      '-i',
      clipPaths[1]!,
      '-filter_complex',
      `[0:v]trim=0:${half + xfadeDur},setpts=PTS-STARTPTS,${effectChain}[v0];` +
        `[1:v]trim=0:${half + xfadeDur},setpts=PTS-STARTPTS,${effectChain}[v1];` +
        `[v0][v1]xfade=transition=fade:duration=${xfadeDur}:offset=${half}[vout]`,
      '-map',
      '[vout]',
      '-t',
      String(loopSec),
      '-an',
      ...AMBIENT_X264,
      visualMasterPath,
    ]);
  } else if (clipPaths.length === 1) {
    await runFfmpeg('ffmpeg', [
      '-y',
      '-stream_loop',
      '-1',
      '-i',
      clipPaths[0]!,
      '-t',
      String(loopSec),
      '-vf',
      effectChain,
      '-an',
      ...AMBIENT_X264,
      visualMasterPath,
    ]);
  } else {
    const color =
      opts.concept.time === 'night' ? '0x0b1220' : opts.concept.time === 'day' ? '0x1a2740' : '0x121820';
    await runFfmpeg('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=${color}:s=${width}x${height}:d=${loopSec}:r=${fps}`,
      '-vf',
      rainOverlay
        ? `eq=brightness=0.02:contrast=1.05:saturation=0.9,format=yuv420p`
        : `eq=brightness=0.01:contrast=1.02,format=yuv420p`,
      '-an',
      ...AMBIENT_X264,
      visualMasterPath,
    ]);
  }

  const timeline: AmbientVisualTimeline = {
    strategy: clipPaths.length > 0 ? 'loop' : 'synthetic',
    queries,
    clips,
    effects: {
      slowZoom,
      rainOverlay,
      lightFlicker,
    },
  };

  return { timeline, visualMasterPath };
}

function buildEffectFilters(opts: {
  width: number;
  height: number;
  fps: number;
  rainOverlay: boolean;
  lightFlicker: boolean;
  slowZoom: boolean;
}): string {
  const parts: string[] = [
    `scale=${opts.width}:${opts.height}:force_original_aspect_ratio=increase`,
    `crop=${opts.width}:${opts.height}`,
  ];

  if (opts.slowZoom) {
    parts.push(
      `zoompan=z='min(zoom+0.00008,1.04)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${opts.width}x${opts.height}:fps=${opts.fps}`,
    );
  }

  // Evitar noise= forte: grão alto destrói compressão H.264 (~20 Mbps) e enche o disco em renders longos.
  if (opts.rainOverlay) {
    parts.push('eq=contrast=1.03:saturation=0.92');
  }

  if (opts.lightFlicker) {
    parts.push(`eq=brightness='0.015*sin(2*PI*t/3.5)':contrast=1.03`);
  }

  parts.push(`fps=${opts.fps}`, 'format=yuv420p');
  return parts.join(',');
}

/** Mux: loopa visual curto até cobrir o áudio. Prefere copy de vídeo (sem reencode). */
export async function muxAmbient(opts: {
  visualMasterPath: string;
  audioMasterPath: string;
  durationSec: number;
  outputPath: string;
}): Promise<void> {
  const audioIsAac = /\.(m4a|aac|mp4)$/i.test(opts.audioMasterPath);
  const audioCodec = audioIsAac
    ? (['-c:a', 'copy'] as const)
    : (['-c:a', 'aac', '-b:a', '192k'] as const);

  // 1ª tentativa: copiar o visual já encodado (rápido e barato em disco).
  try {
    await runFfmpeg('ffmpeg', [
      '-y',
      '-stream_loop',
      '-1',
      '-i',
      opts.visualMasterPath,
      '-i',
      opts.audioMasterPath,
      '-t',
      String(opts.durationSec),
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'copy',
      ...audioCodec,
      '-shortest',
      '-movflags',
      '+faststart',
      opts.outputPath,
    ]);
    return;
  } catch {
    // Fallback: reencode com teto de bitrate (alguns containers/codecs não aceitam copy+loop).
  }

  await runFfmpeg('ffmpeg', [
    '-y',
    '-stream_loop',
    '-1',
    '-i',
    opts.visualMasterPath,
    '-i',
    opts.audioMasterPath,
    '-t',
    String(opts.durationSec),
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    ...AMBIENT_X264,
    ...audioCodec,
    '-shortest',
    '-movflags',
    '+faststart',
    opts.outputPath,
  ]);
}

export async function generateThumbnail(opts: {
  visualMasterPath: string;
  outputPath: string;
  title?: string;
}): Promise<void> {
  await runFfmpeg('ffmpeg', [
    '-y',
    '-ss',
    '2',
    '-i',
    opts.visualMasterPath,
    '-frames:v',
    '1',
    '-q:v',
    '2',
    opts.outputPath,
  ]);
}
