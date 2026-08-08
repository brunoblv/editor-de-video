import fsp from 'node:fs/promises';
import path from 'node:path';
import { config, type AmbientConcept, type AmbientVisualTimeline } from '@editor-video/core';
import { runFfmpeg } from '../ffmpeg.js';
import { downloadFile } from '../v2/download.js';
import { searchBestStockLandscape } from './media-search-landscape.js';

/**
 * Gera um Visual Master curto (loopável) + opcionalmente estende/mux com áudio.
 * Estratégia eficiente da spec §22: visual curto + audio master → loop → mux.
 */
export async function buildVisualMaster(opts: {
  concept: AmbientConcept;
  workDir: string;
  masterDurationSec: number;
}): Promise<{ timeline: AmbientVisualTimeline; visualMasterPath: string }> {
  const width = config.ambient.width;
  const height = config.ambient.height;
  const fps = config.ambient.fps;
  const loopSec = Math.min(45, Math.max(20, opts.masterDurationSec));
  const queries = opts.concept.visualQueries.length
    ? opts.concept.visualQueries
    : [`${opts.concept.environment} ${opts.concept.weather} ${opts.concept.time}`];

  const usedUrls = new Set<string>();
  const clips: AmbientVisualTimeline['clips'] = [];
  const mediaDir = path.join(opts.workDir, 'visual-media');
  await fsp.mkdir(mediaDir, { recursive: true });

  let primaryPath: string | null = null;

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
      });

      if (!primaryPath) primaryPath = rawPath;
    }
  } catch (err) {
    // Sem API de stock: cai para visual sintético (gradiente + chuva).
    clips.push({
      query: queries[0] ?? 'ambient',
      durationSec: loopSec,
    });
  }

  const visualMasterPath = path.join(opts.workDir, 'visual-master.mp4');
  const rainOverlay = /rain|thunder|storm/i.test(
    `${opts.concept.weather} ${opts.concept.audioLayers.join(' ')}`,
  );

  if (primaryPath) {
    const zoomFilter =
      `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
      `crop=${width}:${height},` +
      `zoompan=z='min(zoom+0.00008,1.04)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps},` +
      `fps=${fps},format=yuv420p`;

    await runFfmpeg('ffmpeg', [
      '-y',
      '-stream_loop',
      '-1',
      '-i',
      primaryPath,
      '-t',
      String(loopSec),
      '-vf',
      zoomFilter,
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      visualMasterPath,
    ]);
  } else {
    // Fallback: cor sólida com leve variação (sem stock).
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
        ? `noise=alls=8:allf=t,eq=brightness=0.02:contrast=1.05,format=yuv420p`
        : `eq=brightness=0.01:contrast=1.02,format=yuv420p`,
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      visualMasterPath,
    ]);
  }

  const timeline: AmbientVisualTimeline = {
    strategy: primaryPath ? 'loop' : 'kenburns',
    queries,
    clips,
    effects: {
      slowZoom: true,
      rainOverlay,
      lightFlicker: opts.concept.environment === 'cabin',
    },
  };

  return { timeline, visualMasterPath };
}

/** Mux: loopa visual curto até cobrir o áudio master. */
export async function muxAmbient(opts: {
  visualMasterPath: string;
  audioMasterPath: string;
  durationSec: number;
  outputPath: string;
}): Promise<void> {
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
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
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
