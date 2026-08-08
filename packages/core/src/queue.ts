import type { ConnectionOptions } from 'bullmq';
import { config } from './config.js';

export const RENDER_QUEUE = 'render';

export type AmbientRenderMode =
  | 'preview'
  | 'render'
  | 'regenerate_audio'
  | 'regenerate_visual'
  | 'regenerate_all';

export interface RenderJobData {
  projectId: string;
  /** Modo do pipeline Ambient (ignorado pelos outros kinds). */
  ambientMode?: AmbientRenderMode;
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
