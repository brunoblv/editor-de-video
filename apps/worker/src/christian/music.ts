import fsp from 'node:fs/promises';
import path from 'node:path';
import { config, repoRoot } from '@editor-video/core';
import { logger } from '../logger.js';

const log = logger('christian-music');

const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.ogg']);

/**
 * Biblioteca local de música instrumental royalty-free (docs/Cristão — trilha
 * de fundo). Convenção de pasta igual a piper/models: coloque os arquivos em
 * MUSIC_DIR (padrão "music/" na raiz do monorepo) e o pipeline escolhe um ao
 * acaso a cada vídeo. Vazio = segue sem música (feature opcional).
 */
async function listTracks(): Promise<string[]> {
  const dir = path.isAbsolute(config.music.dir) ? config.music.dir : path.resolve(repoRoot, config.music.dir);
  let entries: string[];
  try {
    entries = await fsp.readdir(dir);
  } catch {
    return [];
  }
  return entries.filter((name) => AUDIO_EXT.has(path.extname(name).toLowerCase())).map((name) => path.join(dir, name));
}

/** Escolhe uma faixa aleatória da biblioteca. Retorna null se a pasta não existir ou estiver vazia. */
export async function pickRandomTrack(): Promise<string | null> {
  const tracks = await listTracks();
  if (tracks.length === 0) {
    log.info(`Nenhuma faixa em "${config.music.dir}" — vídeo seguirá sem música de fundo.`);
    return null;
  }
  return tracks[Math.floor(Math.random() * tracks.length)]!;
}
