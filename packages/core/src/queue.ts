import type { ConnectionOptions } from 'bullmq';
import { config } from './config.js';

export const RENDER_QUEUE = 'render';

export type AmbientRenderMode =
  | 'preview'
  | 'render'
  | 'regenerate_audio'
  | 'regenerate_visual'
  | 'regenerate_all'
  | 'generate_short';

export interface RenderJobData {
  projectId: string;
  /** Modo do pipeline Ambient (ignorado pelos outros kinds). */
  ambientMode?: AmbientRenderMode;
  /** Quando presente, o worker só reanalisa este SoundAsset (sem render). */
  analyzeSoundAssetId?: string;
  /** Publish no YouTube após render (somente se gates passarem). */
  publishToYoutube?: boolean;
}

export function redisConnection(): ConnectionOptions {
  const url = new URL(config.redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.password ? { password: url.password } : {}),
    ...(url.username ? { username: url.username } : {}),
    // BullMQ exige null para permitir bloqueio indefinido do worker.
    maxRetriesPerRequest: null,
  };
}
