/**
 * Busca e áudio do YouTube via yt-dlp (Reactive Lyrics). Decisão do usuário
 * em 04/11/2026: qualquer vídeo pode ser baixado, sempre com declaração de
 * direitos registrada no asset. Baixar fora das funções do YouTube contraria
 * os termos da plataforma e música comercial pode gerar reivindicação; a
 * interface avisa antes.
 *
 * Segurança: a busca vai como um único argumento `ytsearchN:<texto>` depois de
 * `--`; o download aceita só um ID de 11 caracteres e monta a URL aqui (nada
 * de URL arbitrária vinda do cliente). Sem shell, com timeout.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { minimalEnv, runProcess, toolPaths } from './process.js';

export type YoutubeSearchResult = {
  videoId: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  thumbnail: string | null;
  url: string;
  live: boolean;
};

export type YoutubeAudioInfo = {
  videoId: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  /** Licença declarada no YouTube (ex.: "Creative Commons Attribution license (reuse allowed)"); null = padrão. */
  license: string | null;
  url: string;
  uploadDate: string | null;
};

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function ytDlpBin(): string {
  return process.env.YTDLP_BIN || 'yt-dlp';
}

export function isYoutubeVideoId(value: string): boolean {
  return VIDEO_ID.test(value);
}

export function youtubeWatchUrl(videoId: string): string {
  if (!VIDEO_ID.test(videoId)) throw new Error('ID de vídeo do YouTube inválido');
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Uma linha JSON por resultado (`--flat-playlist --dump-json`). */
export function parseYoutubeSearchOutput(stdout: string): YoutubeSearchResult[] {
  const out: YoutubeSearchResult[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim().startsWith('{')) continue;
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const id = typeof e.id === 'string' ? e.id : '';
    if (!VIDEO_ID.test(id)) continue; // canais e playlists ficam de fora
    const thumbs = Array.isArray(e.thumbnails) ? (e.thumbnails as Array<{ url?: string }>) : [];
    out.push({
      videoId: id,
      title: String(e.title ?? id),
      channel: typeof e.channel === 'string' ? e.channel : typeof e.uploader === 'string' ? e.uploader : null,
      durationSec: typeof e.duration === 'number' ? e.duration : null,
      thumbnail: thumbs.length ? (thumbs[thumbs.length - 1]!.url ?? null) : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      url: youtubeWatchUrl(id),
      live: e.live_status === 'is_live' || e.live_status === 'is_upcoming',
    });
  }
  return out;
}

export async function searchYoutube(query: string, options: { limit?: number; signal?: AbortSignal } = {}): Promise<YoutubeSearchResult[]> {
  const text = query.replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  if (!text) return [];
  const limit = Math.max(1, Math.min(20, options.limit ?? 10));
  const { stdout } = await runProcess(
    ytDlpBin(),
    ['--flat-playlist', '--dump-json', '--skip-download', '--no-warnings', '--ignore-config', '--', `ytsearch${limit}:${text}`],
    { signal: options.signal, timeoutMs: 60_000, env: minimalEnv() },
  );
  return parseYoutubeSearchOutput(stdout);
}

export async function youtubeAudioInfo(videoId: string, options: { signal?: AbortSignal } = {}): Promise<YoutubeAudioInfo> {
  const url = youtubeWatchUrl(videoId);
  const { stdout } = await runProcess(ytDlpBin(), ['--dump-json', '--skip-download', '--no-playlist', '--no-warnings', '--ignore-config', '--', url], {
    signal: options.signal,
    timeoutMs: 90_000,
    env: minimalEnv(),
    maxStdoutChars: 20_000_000,
  });
  const e = JSON.parse(stdout.trim().split(/\r?\n/).pop()!) as Record<string, unknown>;
  if (e.is_live === true || e.live_status === 'is_live' || e.live_status === 'is_upcoming') throw new Error('Transmissões ao vivo não podem ser usadas.');
  return {
    videoId,
    title: String(e.title ?? videoId),
    channel: typeof e.channel === 'string' ? e.channel : typeof e.uploader === 'string' ? e.uploader : null,
    durationSec: typeof e.duration === 'number' ? e.duration : null,
    license: typeof e.license === 'string' ? e.license : null,
    url,
    uploadDate: typeof e.upload_date === 'string' ? e.upload_date : null,
  };
}

/**
 * Baixa o melhor áudio e converte para FLAC (sem perda adicional; o original
 * do YouTube já é comprimido). Recusa vídeos acima de `maxDurationSec` antes
 * de baixar.
 */
export async function downloadYoutubeAudio(
  videoId: string,
  options: { outDir: string; maxDurationSec: number; signal?: AbortSignal },
): Promise<{ file: string; info: YoutubeAudioInfo }> {
  const info = await youtubeAudioInfo(videoId, options);
  if (info.durationSec !== null && info.durationSec > options.maxDurationSec) {
    throw Object.assign(new Error(`Vídeo com ${Math.round(info.durationSec)} s; o limite é ${options.maxDurationSec} s.`), { category: 'LIMIT' });
  }
  await fsp.mkdir(options.outDir, { recursive: true });
  const ffmpeg = toolPaths().ffmpeg;
  await runProcess(
    ytDlpBin(),
    [
      '-f', 'bestaudio/best',
      '-x', '--audio-format', 'flac',
      '--no-playlist', '--no-progress', '--no-warnings', '--ignore-config',
      ...(path.isAbsolute(ffmpeg) ? ['--ffmpeg-location', ffmpeg] : []),
      '-o', path.join(options.outDir, `${videoId}.%(ext)s`),
      '--', info.url,
    ],
    { signal: options.signal, timeoutMs: 10 * 60_000, env: minimalEnv() },
  );
  const file = path.join(options.outDir, `${videoId}.flac`);
  await fsp.access(file);
  return { file, info };
}
