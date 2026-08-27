import { Queue } from 'bullmq';
import { RENDER_QUEUE, config, redisConnection, type RenderJobData } from '@editor-video/core/server';

// Mesmo motivo do singleton do Prisma: o hot reload do Next recriaria conexões.
const globalForQueue = globalThis as unknown as { renderQueue?: Queue<RenderJobData> };

export const renderQueue: Queue<RenderJobData> =
  globalForQueue.renderQueue ??
  new Queue<RenderJobData>(RENDER_QUEUE, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: config.ambient.maxRetries,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForQueue.renderQueue = renderQueue;
}
