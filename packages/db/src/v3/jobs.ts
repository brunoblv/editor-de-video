/**
 * Jobs persistidos + filas BullMQ separadas (§11): análise, prévia, render
 * curto, render longo e publicação — prévias não esperam atrás de um Ambient
 * de horas. Estado oficial fica no banco (sobrevive a reinício); BullMQ só
 * transporta. Workers remotos usam lease + heartbeat via HTTPS (§10).
 */
import { Queue } from 'bullmq';
import { getStorage, redisConnection } from '@editor-video/core/server';
import { assertTransition, DomainError, JOB_TRANSITIONS, TERMINAL_JOB_STATES, type JobState } from '@editor-video/domain';
import { parseTimeline } from '@editor-video/timeline';
import type { JobKind, Prisma, RenderJob } from '@prisma/client';
import { prisma } from '../client.js';
import { authorizeJob, authorizeRevision, type Actor } from './access.js';

export const V3_QUEUES = {
  analysis: 'v3-analysis',
  preview: 'v3-preview',
  renderShort: 'v3-render-short',
  renderLong: 'v3-render-long',
  publish: 'v3-publish',
} as const;

export type V3QueueName = (typeof V3_QUEUES)[keyof typeof V3_QUEUES];

/** Acima disso o render final vai para a fila longa. */
export const LONG_RENDER_THRESHOLD_SEC = 15 * 60;
/** Sem heartbeat por este tempo, o job aparece como "worker offline". */
export const HEARTBEAT_STALE_MS = 90_000;

export type V3JobPayload = { jobId: string };

const queues = new Map<string, Queue<V3JobPayload>>();
export function getQueue(name: V3QueueName): Queue<V3JobPayload> {
  let q = queues.get(name);
  if (!q) {
    q = new Queue<V3JobPayload>(name, { connection: redisConnection() });
    queues.set(name, q);
  }
  return q;
}

/** Fecha conexões das filas (encerramento do processo/testes). */
export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close().catch(() => undefined)));
  queues.clear();
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

export type EnqueueInput = {
  projectId: string;
  kind: JobKind;
  queue: V3QueueName;
  revisionId?: string | null;
  variantId?: string | null;
  deliverableId?: string | null;
  assetId?: string | null;
  params?: Record<string, unknown>;
  requestedById?: string | null;
  idempotencyKey?: string | null;
  /** Prévia tem prioridade sobre renders longos (menor = mais prioritário). */
  priority?: number;
};

export async function enqueueJob(input: EnqueueInput): Promise<RenderJob> {
  if (input.idempotencyKey) {
    const existing = await prisma.renderJob.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
  }
  const job = await prisma.renderJob.create({
    data: {
      projectId: input.projectId,
      kind: input.kind,
      queue: input.queue,
      revisionId: input.revisionId ?? null,
      variantId: input.variantId ?? null,
      deliverableId: input.deliverableId ?? null,
      assetId: input.assetId ?? null,
      paramsJson: input.params ? json(input.params) : undefined,
      requestedById: input.requestedById ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    },
  });
  try {
    await withTimeout(
      getQueue(input.queue).add(input.kind, { jobId: job.id }, { jobId: job.id, priority: input.priority, removeOnComplete: 1000, removeOnFail: 5000 }),
      ENQUEUE_TIMEOUT_MS,
    );
  } catch (err) {
    // Redis indisponível: o job fica QUEUED no banco e o dispatcher reenvia.
    await prisma.renderJob.update({ where: { id: job.id }, data: { stage: 'Aguardando fila (Redis indisponível)', errorCategory: 'TRANSIENT' } });
    console.error('[v3] falha ao enfileirar no Redis', { jobId: job.id, error: (err as Error).message });
  }
  return job;
}

/** Sem Redis, o ioredis enfileira comandos indefinidamente; não deixamos a requisição presa. */
const ENQUEUE_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Redis não respondeu em ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Dispatcher: reenvia ao BullMQ jobs QUEUED no banco que não estão na fila
 * (Redis caiu no enfileiramento, reinício). O claim por lease impede
 * execução dupla mesmo se um job for entregue duas vezes.
 */
export async function requeueOrphans(olderThanMs = 30_000): Promise<number> {
  const orphans = await prisma.renderJob.findMany({
    where: { state: 'QUEUED', createdAt: { lt: new Date(Date.now() - olderThanMs) } },
    take: 100,
    orderBy: { createdAt: 'asc' },
  });
  let count = 0;
  for (const job of orphans) {
    const queue = getQueue(job.queue as V3QueueName);
    const existing = await withTimeout(queue.getJob(job.id), ENQUEUE_TIMEOUT_MS).catch(() => null);
    if (existing) continue;
    await withTimeout(queue.add(job.kind, { jobId: job.id }, { jobId: job.id }), ENQUEUE_TIMEOUT_MS);
    await prisma.renderJob.update({ where: { id: job.id }, data: { stage: 'Reenfileirado pelo dispatcher', errorCategory: null } });
    count += 1;
  }
  return count;
}

export type RenderRequest ={ revisionId: string; variantId?: string | null; quality: 'preview' | 'final'; idempotencyKey?: string | null };

/** Solicita render: cria entrega PENDING + job; responde com jobId (§13). */
export async function requestRender(actor: Actor, request: RenderRequest) {
  const revision = await authorizeRevision(actor, request.revisionId, 'render.request');
  const doc = parseTimeline(revision.documentJson);
  if (doc.video.durationFrames === 0) throw new DomainError('INVALID', 'A timeline está vazia.');
  if (request.variantId && request.variantId !== 'base' && !doc.variants.some((v) => v.id === request.variantId)) {
    throw new DomainError('INVALID', `Variante ${request.variantId} não existe nesta revisão.`);
  }
  const durationSec = (doc.video.durationFrames * doc.video.fpsDenominator) / doc.video.fpsNumerator;
  const queue = request.quality === 'preview' ? V3_QUEUES.preview : durationSec > LONG_RENDER_THRESHOLD_SEC ? V3_QUEUES.renderLong : V3_QUEUES.renderShort;
  const deliverable = await prisma.deliverable.create({
    data: {
      projectId: revision.projectId,
      revisionId: revision.id,
      variantId: request.variantId ?? null,
      kind: request.quality === 'preview' ? 'PREVIEW' : 'FINAL',
      origin: 'HUB',
      state: 'PENDING',
      presetVersion: doc.output.presetVersion,
    },
  });
  const job = await enqueueJob({
    projectId: revision.projectId,
    kind: request.quality === 'preview' ? 'RENDER_PREVIEW' : 'RENDER_FINAL',
    queue,
    revisionId: revision.id,
    variantId: request.variantId ?? null,
    deliverableId: deliverable.id,
    requestedById: actor.userId,
    idempotencyKey: request.idempotencyKey ?? null,
    priority: request.quality === 'preview' ? 1 : 10,
  });
  return { jobId: job.id, deliverableId: deliverable.id, queue };
}

export async function requestCancel(actor: Actor, jobId: string) {
  const job = await authorizeJob(actor, jobId, 'render.request');
  if (TERMINAL_JOB_STATES.includes(job.state as JobState)) return job;
  if (job.state === 'QUEUED') {
    await getQueue(job.queue as V3QueueName).remove(job.id).catch(() => undefined);
    return prisma.renderJob.update({ where: { id: jobId }, data: { state: 'CANCELLED', finishedAt: new Date(), stage: 'Cancelado' } });
  }
  assertTransition('Job', JOB_TRANSITIONS, job.state as JobState, 'CANCEL_REQUESTED');
  return prisma.renderJob.update({ where: { id: jobId }, data: { state: 'CANCEL_REQUESTED' } });
}

/** Retry controlado: só de FAILED/CANCELLED e dentro do limite de tentativas. */
export async function retryJob(actor: Actor, jobId: string) {
  const job = await authorizeJob(actor, jobId, 'render.request');
  if (job.state !== 'FAILED' && job.state !== 'CANCELLED') throw new DomainError('CONFLICT', `Job em ${job.state} não pode ser repetido.`);
  if (job.attempts >= job.maxAttempts) throw new DomainError('LIMIT', 'Limite de tentativas atingido.');
  await prisma.renderJob.update({ where: { id: jobId }, data: { state: 'QUEUED', errorMessage: null, errorCategory: null, progress: 0, stage: 'Reenfileirado' } });
  await getQueue(job.queue as V3QueueName).add(job.kind, { jobId }, { jobId: `${jobId}-r${job.attempts}` });
  return { jobId };
}

export type JobSnapshot = {
  id: string;
  kind: JobKind;
  state: string;
  progress: number;
  stage: string | null;
  errorMessage: string | null;
  errorCategory: string | null;
  workerOffline: boolean;
  deliverableId: string | null;
  steps: Array<{ name: string; state: string }>;
  updatedAt: string;
};

export async function getJobSnapshot(actor: Actor, jobId: string): Promise<JobSnapshot> {
  await authorizeJob(actor, jobId, 'project.view');
  const job = await prisma.renderJob.findUniqueOrThrow({ where: { id: jobId }, include: { steps: { orderBy: { startedAt: 'asc' } } } });
  const lastBeat = job.heartbeatAt ?? job.startedAt;
  const workerOffline =
    (job.state === 'RUNNING' || job.state === 'CANCEL_REQUESTED') && (!lastBeat || Date.now() - lastBeat.getTime() > HEARTBEAT_STALE_MS);
  return {
    id: job.id,
    kind: job.kind,
    state: job.state,
    progress: job.progress,
    stage: job.stage,
    errorMessage: job.errorMessage,
    errorCategory: job.errorCategory,
    workerOffline,
    deliverableId: job.deliverableId,
    steps: job.steps.map((s) => ({ name: s.name, state: s.state })),
    updatedAt: (job.heartbeatAt ?? job.finishedAt ?? job.startedAt ?? job.createdAt).toISOString(),
  };
}

export async function listJobs(actor: Actor, filter: { state?: JobState; take?: number } = {}) {
  const memberships = await prisma.membership.findMany({ where: { userId: actor.userId }, select: { workspaceId: true } });
  return prisma.renderJob.findMany({
    where: { project: { workspaceId: { in: memberships.map((m) => m.workspaceId) } }, ...(filter.state ? { state: filter.state } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(filter.take ?? 50, 200),
    include: { project: { select: { id: true, title: true, channel: { select: { name: true } } } } },
  });
}

// ---- Lado do worker (local ou remoto via HTTPS) ----

/** Reivindica o job com lease. Retorna null se outro worker já pegou ou foi cancelado. */
export async function claimJob(jobId: string, owner: string, leaseMs = 120_000): Promise<RenderJob | null> {
  const now = new Date();
  const result = await prisma.renderJob.updateMany({
    where: {
      id: jobId,
      OR: [{ state: 'QUEUED' }, { state: 'RUNNING', leaseExpiresAt: { lt: now } }],
    },
    data: { state: 'RUNNING', leaseOwner: owner, leaseExpiresAt: new Date(now.getTime() + leaseMs), heartbeatAt: now, startedAt: now, attempts: { increment: 1 } },
  });
  if (result.count === 0) return null;
  return prisma.renderJob.findUnique({ where: { id: jobId } });
}

/** Próximo job de uma fila para workers remotos (sem expor Redis). */
export async function claimNextJob(queues: string[], owner: string, leaseMs = 120_000): Promise<RenderJob | null> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "RenderJob"
    WHERE queue = ANY(${queues}) AND (state = 'QUEUED' OR (state = 'RUNNING' AND "leaseExpiresAt" < now()))
    ORDER BY "createdAt" ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED`;
  const id = rows[0]?.id;
  return id ? claimJob(id, owner, leaseMs) : null;
}

/** Heartbeat + progresso; devolve true se o cancelamento foi solicitado. */
export async function heartbeat(jobId: string, owner: string, update: { progress?: number; stage?: string; leaseMs?: number } = {}): Promise<{ cancelRequested: boolean }> {
  const now = new Date();
  await prisma.renderJob.updateMany({
    where: { id: jobId, leaseOwner: owner },
    data: {
      heartbeatAt: now,
      leaseExpiresAt: new Date(now.getTime() + (update.leaseMs ?? 120_000)),
      ...(update.progress !== undefined ? { progress: Math.max(0, Math.min(1, update.progress)) } : {}),
      ...(update.stage !== undefined ? { stage: update.stage } : {}),
    },
  });
  const job = await prisma.renderJob.findUnique({ where: { id: jobId }, select: { state: true } });
  return { cancelRequested: job?.state === 'CANCEL_REQUESTED' };
}

export async function finishJob(
  jobId: string,
  owner: string,
  outcome: { state: 'SUCCEEDED' | 'FAILED' | 'CANCELLED'; errorMessage?: string; errorCategory?: string; environment?: Record<string, unknown> },
) {
  return prisma.renderJob.updateMany({
    where: { id: jobId, leaseOwner: owner },
    data: {
      state: outcome.state,
      finishedAt: new Date(),
      leaseExpiresAt: null,
      progress: outcome.state === 'SUCCEEDED' ? 1 : undefined,
      stage: outcome.state === 'SUCCEEDED' ? 'Concluído' : outcome.state === 'CANCELLED' ? 'Cancelado' : 'Falhou',
      errorMessage: outcome.errorMessage?.slice(0, 4000) ?? null,
      errorCategory: outcome.errorCategory ?? null,
      ...(outcome.environment ? { environmentJson: json(outcome.environment) } : {}),
    },
  });
}

async function artifactAvailable(key: string | null): Promise<boolean> {
  return key ? getStorage().exists(key) : true;
}

/** Etapas idempotentes: pula se já concluída nesta tentativa ou cacheada globalmente (AC-09). */
export async function runStep<T>(
  jobId: string,
  name: string,
  cacheKey: string | null,
  fn: () => Promise<{ output: T; artifactKey?: string | null }>,
): Promise<{ output: T; artifactKey: string | null; cached: boolean }> {
  const existing = await prisma.jobStep.findUnique({ where: { jobId_name: { jobId, name } } });
  if (existing?.state === 'SUCCEEDED' && (await artifactAvailable(existing.artifactKey))) {
    return { output: existing.outputJson as T, artifactKey: existing.artifactKey, cached: true };
  }
  if (cacheKey) {
    let cached = await prisma.artifactCache.findUnique({ where: { cacheKey } });
    if (cached && !(await artifactAvailable(cached.artifactKey))) {
      // Artefato removido (retenção/limpeza): invalida e recalcula.
      await prisma.artifactCache.delete({ where: { cacheKey } }).catch(() => undefined);
      cached = null;
    }
    if (cached) {
      await prisma.jobStep.upsert({
        where: { jobId_name: { jobId, name } },
        update: { state: 'SUCCEEDED', cacheKey, artifactKey: cached.artifactKey, outputJson: json(cached.outputJson), finishedAt: new Date() },
        create: { jobId, name, cacheKey, state: 'SUCCEEDED', artifactKey: cached.artifactKey, outputJson: json(cached.outputJson), startedAt: new Date(), finishedAt: new Date() },
      });
      return { output: cached.outputJson as T, artifactKey: cached.artifactKey, cached: true };
    }
  }
  await prisma.jobStep.upsert({
    where: { jobId_name: { jobId, name } },
    update: { state: 'RUNNING', startedAt: new Date(), cacheKey },
    create: { jobId, name, cacheKey, state: 'RUNNING', startedAt: new Date() },
  });
  try {
    const { output, artifactKey } = await fn();
    await prisma.jobStep.update({
      where: { jobId_name: { jobId, name } },
      data: { state: 'SUCCEEDED', artifactKey: artifactKey ?? null, outputJson: json(output ?? null), finishedAt: new Date() },
    });
    if (cacheKey) {
      await prisma.artifactCache.upsert({
        where: { cacheKey },
        update: {},
        create: { cacheKey, step: name, artifactKey: artifactKey ?? null, outputJson: json(output ?? null) },
      });
    }
    return { output, artifactKey: artifactKey ?? null, cached: false };
  } catch (err) {
    await prisma.jobStep.update({ where: { jobId_name: { jobId, name } }, data: { state: 'FAILED', finishedAt: new Date() } });
    throw err;
  }
}
