/**
 * Worker V3 de mídia/render. Consome as filas separadas (§11) com
 * concorrência própria; cada job é reivindicado com lease no banco,
 * envia heartbeat e obedece cancelamento (encerra subprocessos e remove só
 * os temporários desta tentativa).
 *
 *   npm run start -w @editor-video/render-worker
 *   V3_QUEUES=v3-preview,v3-render-short  (opcional: limitar filas desta máquina)
 */
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Worker, type Job } from 'bullmq';
import { redisConnection } from '@editor-video/core/server';
import { prisma } from '@editor-video/db';
import { claimJob, finishJob, heartbeat, requeueOrphans, V3_QUEUES, type V3JobPayload } from '@editor-video/db/v3';
import { DomainError } from '@editor-video/domain';
import { ProcessError } from '@editor-video/integrations';
import type { RenderJob } from '@prisma/client';
import type { JobContext } from './context.js';
import { handleAnalyze } from './handlers/analyze.js';
import { handleRender } from './handlers/render.js';
import { handleResolveExport } from './handlers/resolve-export.js';
import { log } from './log.js';

const OWNER = `${os.hostname()}:${process.pid}`;
const WORK_ROOT = process.env.V3_WORK_DIR ?? path.join(os.tmpdir(), 'editor-video-v3');

const CONCURRENCY: Record<string, number> = {
  [V3_QUEUES.analysis]: Number(process.env.V3_ANALYSIS_CONCURRENCY ?? 2),
  [V3_QUEUES.preview]: Number(process.env.V3_PREVIEW_CONCURRENCY ?? 2),
  [V3_QUEUES.renderShort]: Number(process.env.V3_RENDER_CONCURRENCY ?? 1),
  [V3_QUEUES.renderLong]: Number(process.env.V3_LONG_RENDER_CONCURRENCY ?? 1),
};

function categorize(err: unknown): string {
  if (err instanceof DomainError) return err.code;
  if (err instanceof ProcessError && err.timedOut) return 'TRANSIENT';
  const category = (err as { category?: string }).category;
  return category ?? 'INTERNAL';
}

async function dispatch(job: RenderJob, ctx: JobContext): Promise<Record<string, unknown> | void> {
  switch (job.kind) {
    case 'ANALYZE':
    case 'TRANSCRIBE':
      return handleAnalyze(job, ctx);
    case 'RENDER_PREVIEW':
    case 'RENDER_FINAL':
      return handleRender(job, ctx);
    case 'RESOLVE_EXPORT':
      return handleResolveExport(job, ctx);
    default:
      throw new Error(`Tipo de job não suportado por este worker: ${job.kind}`);
  }
}

async function processJob(bullJob: Job<V3JobPayload>): Promise<void> {
  const { jobId } = bullJob.data;
  const job = await claimJob(jobId, OWNER);
  if (!job) {
    log('info', 'job já reivindicado/cancelado; ignorando', { jobId });
    return;
  }
  const ctxLog = { jobId, projectId: job.projectId, kind: job.kind, attempt: job.attempts };
  const workDir = path.join(WORK_ROOT, `${jobId}-a${job.attempts}`);
  await fsp.mkdir(workDir, { recursive: true });
  const controller = new AbortController();
  let lastProgress = 0;
  let lastStage = 'Iniciando';

  const beat = setInterval(() => {
    heartbeat(jobId, OWNER, { progress: lastProgress, stage: lastStage })
      .then(({ cancelRequested }) => {
        if (cancelRequested && !controller.signal.aborted) {
          log('warn', 'cancelamento solicitado', ctxLog);
          controller.abort();
        }
      })
      .catch((err) => log('error', 'heartbeat falhou', { ...ctxLog, error: err }));
  }, 10_000);

  const ctx: JobContext = {
    workDir,
    signal: controller.signal,
    progress: async (fraction, stage) => {
      lastProgress = fraction;
      lastStage = stage;
    },
  };

  const started = Date.now();
  log('info', 'job iniciado', ctxLog);
  try {
    const result = await dispatch(job, ctx);
    await finishJob(jobId, OWNER, { state: 'SUCCEEDED', environment: { ...(result?.environment as object | undefined), durationMs: Date.now() - started } });
    log('info', 'job concluído', { ...ctxLog, durationMs: Date.now() - started });
  } catch (err) {
    const cancelled = controller.signal.aborted;
    if (job.deliverableId) {
      await prisma.deliverable.updateMany({ where: { id: job.deliverableId, state: { in: ['PENDING', 'RENDERING', 'VALIDATING'] } }, data: { state: 'FAILED' } });
    }
    await finishJob(jobId, OWNER, {
      state: cancelled ? 'CANCELLED' : 'FAILED',
      errorMessage: cancelled ? 'Cancelado pelo usuário' : (err as Error).message,
      errorCategory: cancelled ? 'CANCELLED' : categorize(err),
    });
    log(cancelled ? 'warn' : 'error', cancelled ? 'job cancelado' : 'job falhou', { ...ctxLog, error: err });
  } finally {
    clearInterval(beat);
    // Remove apenas os temporários desta tentativa.
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

const enabled = (process.env.V3_QUEUES ?? Object.keys(CONCURRENCY).join(',')).split(',').map((q) => q.trim()).filter((q) => q in CONCURRENCY);
const workers = enabled.map((queue) => new Worker<V3JobPayload>(queue, processJob, { connection: redisConnection(), concurrency: CONCURRENCY[queue] }));
log('info', 'render-worker iniciado', { owner: OWNER, queues: enabled, workRoot: WORK_ROOT });

// Dispatcher: jobs persistidos que não chegaram ao Redis voltam para a fila.
const dispatcher = setInterval(() => {
  requeueOrphans()
    .then((n) => n > 0 && log('info', 'jobs órfãos reenfileirados', { count: n }))
    .catch((err) => log('warn', 'dispatcher falhou', { error: err }));
}, 30_000);

async function shutdown() {
  log('info', 'encerrando workers');
  clearInterval(dispatcher);
  await Promise.all(workers.map((w) => w.close()));
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
