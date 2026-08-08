import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config } from './config.js';

/**
 * Abstração de storage. O MVP usa disco local; a fase 2 troca por S3/R2
 * implementando esta mesma interface — nada fora daqui conhece o driver.
 */
export interface Storage {
  put(key: string, data: Readable | Buffer): Promise<void>;
  /** Caminho local legível pelo FFmpeg/Remotion. Em drivers remotos, baixa para tmp. */
  toLocalPath(key: string): Promise<string>;
  createReadStream(key: string, range?: { start: number; end: number }): Promise<Readable>;
  exists(key: string): Promise<boolean>;
  size(key: string): Promise<number>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
}

/** Impede que uma key manipulada escape do diretório de storage. */
function assertSafeKey(key: string): void {
  if (key.length === 0 || key.startsWith('/') || key.includes('..') || path.isAbsolute(key)) {
    throw new Error(`Storage key inválida: "${key}"`);
  }
}

export class LocalDiskStorage implements Storage {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) {
      throw new Error(`Storage key fora do diretório permitido: "${key}"`);
    }
    return full;
  }

  async put(key: string, data: Readable | Buffer): Promise<void> {
    const full = this.resolve(key);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    if (Buffer.isBuffer(data)) {
      await fsp.writeFile(full, data);
      return;
    }
    await pipeline(data, fs.createWriteStream(full));
  }

  async toLocalPath(key: string): Promise<string> {
    const full = this.resolve(key);
    await fsp.access(full);
    return full;
  }

  async createReadStream(key: string, range?: { start: number; end: number }): Promise<Readable> {
    const full = this.resolve(key);
    return fs.createReadStream(full, range);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fsp.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async size(key: string): Promise<number> {
    const stat = await fsp.stat(this.resolve(key));
    return stat.size;
  }

  async delete(key: string): Promise<void> {
    await fsp.rm(this.resolve(key), { force: true });
  }

  async deletePrefix(prefix: string): Promise<void> {
    await fsp.rm(this.resolve(prefix), { force: true, recursive: true });
  }
}

let cached: Storage | null = null;

export function getStorage(): Storage {
  if (cached) return cached;
  if (config.storage.driver !== 'local') {
    throw new Error(
      `STORAGE_DRIVER="${config.storage.driver}" ainda não implementado. O MVP suporta apenas "local".`,
    );
  }
  cached = new LocalDiskStorage(config.storage.localDir);
  return cached;
}

export const storageKeys = {
  source: (projectId: string, clipId: string, ext: string) =>
    `projects/${projectId}/source/${clipId}${ext}`,
  normalized: (projectId: string, clipId: string) =>
    `projects/${projectId}/normalized/${clipId}.mp4`,
  media: (projectId: string, assetId: string, ext: string) =>
    `projects/${projectId}/media/${assetId}${ext}`,
  mediaNormalized: (projectId: string, assetId: string) =>
    `projects/${projectId}/media-normalized/${assetId}.mp4`,
  voiceover: (projectId: string) => `projects/${projectId}/audio/voiceover.wav`,
  output: (projectId: string) => `projects/${projectId}/output/final.mp4`,
  project: (projectId: string) => `projects/${projectId}`,
  soundAsset: (assetId: string, ext: string) => `library/sounds/${assetId}${ext}`,
  ambientAudioMaster: (projectId: string) => `projects/${projectId}/ambient/audio-master.bin`,
  ambientVisualMaster: (projectId: string) => `projects/${projectId}/ambient/visual-master.mp4`,
  ambientPreview: (projectId: string) => `projects/${projectId}/ambient/preview.mp4`,
  ambientThumbnail: (projectId: string) => `projects/${projectId}/ambient/thumbnail.jpg`,
} as const;
