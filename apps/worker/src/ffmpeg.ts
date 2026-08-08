import { spawn } from 'node:child_process';

export interface ProbeResult {
  durationSec: number;
  hasAudio: boolean;
  width: number;
  height: number;
}

interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  duration?: string;
}

interface FfprobeOutput {
  format?: { duration?: string };
  streams?: FfprobeStream[];
}

export function runFfmpeg(
  bin: string,
  args: string[],
  onStdout?: (chunk: string) => void,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      onStdout?.(chunk);
    });
    // FFmpeg escreve muito em stderr; guardamos só o final para diagnóstico.
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-8000);
    });

    child.on('error', (err) => {
      reject(
        new Error(
          `Não foi possível executar "${bin}". Verifique se o FFmpeg está no PATH. (${err.message})`,
        ),
      );
    });
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} saiu com código ${code}:\n${stderr}`));
    });
  });
}

export async function probe(file: string): Promise<ProbeResult> {
  const { stdout } = await runFfmpeg('ffprobe', [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    file,
  ]);

  const parsed = JSON.parse(stdout) as FfprobeOutput;
  const streams = parsed.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');
  const audio = streams.find((s) => s.codec_type === 'audio');

  const duration = Number(
    parsed.format?.duration ?? video?.duration ?? audio?.duration ?? 0,
  );
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Não foi possível determinar a duração do arquivo.');
  }

  if (!video && !audio) {
    throw new Error('O arquivo não contém trilha de vídeo nem de áudio.');
  }

  return {
    durationSec: duration,
    hasAudio: Boolean(audio),
    width: video?.width ?? 0,
    height: video?.height ?? 0,
  };
}

/** Probe que exige vídeo (uploads de clipe Top List). */
export async function probeVideo(file: string): Promise<ProbeResult> {
  const info = await probe(file);
  if (info.width <= 0 || info.height <= 0) {
    throw new Error('O arquivo enviado não contém trilha de vídeo.');
  }
  return info;
}

export interface NormalizeOptions {
  input: string;
  output: string;
  durationSec: number;
  hasAudio: boolean;
  width: number;
  height: number;
  fps: number;
  onProgress?: (ratio: number) => void;
}

/**
 * Converte o clipe para 9:16 sem cortar conteúdo: o vídeo é encaixado inteiro
 * no centro sobre uma cópia ampliada e desfocada de si mesmo (padrão das redes).
 * Também padroniza fps, áudio e loudness para que a concatenação fique estável.
 */
export async function normalizeClip(opts: NormalizeOptions): Promise<void> {
  const { input, output, durationSec, hasAudio, width, height, fps } = opts;

  const videoFilter =
    `[0:v]split=2[bg][fg];` +
    `[bg]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
    `crop=${width}:${height},gblur=sigma=28[bgb];` +
    `[fg]scale=${width}:${height}:force_original_aspect_ratio=decrease[fgs];` +
    `[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=${fps},format=yuv420p[v]`;

  const audioSource = hasAudio ? '[0:a]' : '[1:a]';
  const audioFilter =
    `${audioSource}aresample=async=1:first_pts=0,` +
    `loudnorm=I=-16:TP=-1.5:LRA=11,` +
    `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a]`;

  const args = ['-y', '-i', input];
  if (!hasAudio) {
    // Sem trilha de áudio o render do Remotion falha ao mixar; injetamos silêncio.
    args.push('-f', 'lavfi', '-t', String(durationSec), '-i', 'anullsrc=r=48000:cl=stereo');
  }

  args.push(
    '-filter_complex',
    `${videoFilter};${audioFilter}`,
    '-map',
    '[v]',
    '-map',
    '[a]',
    '-t',
    String(durationSec),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-profile:v',
    'high',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
    '-nostats',
    output,
  );

  let buffer = '';
  await runFfmpeg('ffmpeg', args, (chunk) => {
    if (!opts.onProgress) return;
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const match = /^out_time_ms=(\d+)$/.exec(line.trim());
      if (!match?.[1]) continue;
      const seconds = Number(match[1]) / 1_000_000;
      opts.onProgress(Math.min(1, seconds / durationSec));
    }
  });
}

export async function assertFfmpegAvailable(): Promise<void> {
  await runFfmpeg('ffmpeg', ['-version']);
  await runFfmpeg('ffprobe', ['-version']);
}
