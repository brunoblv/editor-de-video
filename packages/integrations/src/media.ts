/**
 * Inspeção de mídia, hash do original e proxies (§11 passos 2–4, RF-03/RF-05).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { runProcess, toolPaths, type ToolPaths } from './process.js';

export type MediaInfo = {
  container: string | null;
  durationSec: number | null;
  sizeBytes: bigint;
  video: null | {
    codec: string | null;
    width: number;
    height: number;
    /** Dimensões já considerando rotação de metadados. */
    displayWidth: number;
    displayHeight: number;
    fpsNum: number;
    fpsDen: number;
    rotation: number;
    pixFmt: string | null;
    frameCount: number | null;
  };
  audio: null | { codec: string | null; sampleRate: number; channels: number };
  diagnostics: string[];
};

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  pix_fmt?: string;
  sample_rate?: string;
  channels?: number;
  nb_frames?: string;
  tags?: { rotate?: string };
  side_data_list?: Array<{ rotation?: number }>;
  disposition?: { attached_pic?: number };
};

function parseRational(value: string | undefined): { num: number; den: number } | null {
  if (!value) return null;
  const [n, d] = value.split('/').map(Number);
  if (!n || !d || !Number.isFinite(n) || !Number.isFinite(d)) return null;
  return { num: n, den: d };
}

export async function inspectMedia(file: string, paths: ToolPaths = toolPaths()): Promise<MediaInfo> {
  const { stdout } = await runProcess(
    paths.ffprobe,
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
    { timeoutMs: 60_000 },
  );
  const data = JSON.parse(stdout) as {
    format?: { format_name?: string; duration?: string; size?: string };
    streams?: ProbeStream[];
  };
  const streams = data.streams ?? [];
  const diagnostics: string[] = [];
  const vs = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const as = streams.find((s) => s.codec_type === 'audio');
  const stat = await fsp.stat(file);

  let video: MediaInfo['video'] = null;
  if (vs?.width && vs.height) {
    const fps = parseRational(vs.avg_frame_rate) ?? parseRational(vs.r_frame_rate) ?? { num: 30, den: 1 };
    const rotation = Number(vs.tags?.rotate ?? vs.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0);
    const rotated = Math.abs(rotation) % 180 === 90;
    video = {
      codec: vs.codec_name ?? null,
      width: vs.width,
      height: vs.height,
      displayWidth: rotated ? vs.height : vs.width,
      displayHeight: rotated ? vs.width : vs.height,
      fpsNum: fps.num,
      fpsDen: fps.den,
      rotation,
      pixFmt: vs.pix_fmt ?? null,
      frameCount: vs.nb_frames ? Number(vs.nb_frames) : null,
    };
    if (rotation !== 0) diagnostics.push(`Vídeo com rotação de ${rotation}° nos metadados`);
    if (vs.avg_frame_rate && vs.r_frame_rate && vs.avg_frame_rate !== vs.r_frame_rate) {
      diagnostics.push(`Possível frame rate variável (avg ${vs.avg_frame_rate} ≠ r ${vs.r_frame_rate}); normalizar no proxy`);
    }
    if (vs.pix_fmt && !['yuv420p', 'yuvj420p'].includes(vs.pix_fmt)) {
      diagnostics.push(`Pixel format ${vs.pix_fmt} pode exigir conversão para yuv420p na entrega`);
    }
  }
  const audio = as
    ? { codec: as.codec_name ?? null, sampleRate: Number(as.sample_rate ?? 0), channels: as.channels ?? 0 }
    : null;
  const durationSec = data.format?.duration ? Number(data.format.duration) : null;
  if (!video && !audio) diagnostics.push('Nenhum stream de áudio ou vídeo decodificável');
  if (durationSec === null && video) diagnostics.push('Duração ausente (imagem estática ou container sem índice)');

  return {
    container: data.format?.format_name ?? null,
    durationSec,
    sizeBytes: BigInt(stat.size),
    video,
    audio,
    diagnostics,
  };
}

/** sha256 por streaming — não carrega o arquivo inteiro em memória (§11). */
export function hashFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    fs.createReadStream(file, { highWaterMark: 4 * 1024 * 1024 })
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

export type ProxyOptions = {
  height?: number;
  fps?: { num: number; den: number };
  signal?: AbortSignal;
};

/**
 * Proxy leve para o player (RF-05): H.264 baixa resolução, GOP curto para
 * scrubbing, fps constante, preservando o vínculo com o original pelo hash.
 * Escreve em arquivo temporário e renomeia ao final (publicação atômica).
 */
export async function makeProxy(src: string, dst: string, options: ProxyOptions = {}, paths = toolPaths()): Promise<void> {
  const height = options.height ?? 540;
  const tmp = `${dst}.part${path.extname(dst)}`;
  await fsp.mkdir(path.dirname(dst), { recursive: true });
  const args = [
    '-y',
    '-v', 'error',
    '-i', src,
    '-map', '0:v:0?', '-map', '0:a:0?',
    '-vf', `scale=-2:${height}:flags=bicubic,format=yuv420p`,
    ...(options.fps ? ['-r', `${options.fps.num}/${options.fps.den}`, '-fps_mode', 'cfr'] : []),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-g', '15',
    '-c:a', 'aac', '-b:a', '96k',
    '-movflags', '+faststart',
    tmp,
  ];
  try {
    await runProcess(paths.ffmpeg, args, { signal: options.signal });
    await fsp.rename(tmp, dst);
  } catch (err) {
    await fsp.rm(tmp, { force: true });
    throw err;
  }
}

export type SceneCut = { timeSec: number; score: number };

/** Detecção de cortes por filtro de cena do FFmpeg (PySceneDetect é candidato P1). */
export async function detectScenes(
  file: string,
  threshold = 0.3,
  options: { signal?: AbortSignal } = {},
  paths = toolPaths(),
): Promise<SceneCut[]> {
  const cuts: SceneCut[] = [];
  const { stderr } = await runProcess(
    paths.ffmpeg,
    ['-hide_banner', '-i', file, '-an', '-vf', `scale=320:-2,select='gt(scene,${threshold})',metadata=print`, '-f', 'null', '-'],
    { signal: options.signal, stderrTailChars: 5_000_000 },
  );
  let pending: number | null = null;
  for (const line of stderr.split(/\r?\n/)) {
    const time = /pts_time:([\d.]+)/.exec(line);
    if (time) pending = Number(time[1]);
    const score = /lavfi\.scene_score=([\d.]+)/.exec(line);
    if (score && pending !== null) {
      cuts.push({ timeSec: pending, score: Number(score[1]) });
      pending = null;
    }
  }
  return cuts;
}

/** Converte cortes em intervalos [start, end) de cenas. */
export function cutsToScenes(cuts: SceneCut[], durationSec: number): Array<{ startSec: number; endSec: number }> {
  const points = [0, ...cuts.map((c) => c.timeSec).filter((t) => t > 0 && t < durationSec), durationSec];
  const scenes: Array<{ startSec: number; endSec: number }> = [];
  for (let i = 1; i < points.length; i += 1) scenes.push({ startSec: points[i - 1]!, endSec: points[i]! });
  return scenes;
}

/** Extrai frames JPEG em instantes da fonte, para evidência visual ao agente (RF-07). */
export async function extractFrames(
  file: string,
  timestampsSec: number[],
  outDir: string,
  options: { width?: number; signal?: AbortSignal } = {},
  paths = toolPaths(),
): Promise<Array<{ timeSec: number; path: string }>> {
  await fsp.mkdir(outDir, { recursive: true });
  const frames: Array<{ timeSec: number; path: string }> = [];
  for (const t of timestampsSec) {
    const out = path.join(outDir, `frame-${Math.round(t * 1000)}.jpg`);
    await runProcess(
      paths.ffmpeg,
      ['-y', '-v', 'error', '-ss', t.toFixed(3), '-i', file, '-frames:v', '1', '-vf', `scale=${options.width ?? 640}:-2`, '-q:v', '4', out],
      { signal: options.signal, timeoutMs: 60_000 },
    );
    frames.push({ timeSec: t, path: out });
  }
  return frames;
}
