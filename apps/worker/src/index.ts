import { UnrecoverableError, Worker, type Job } from 'bullmq';
import {
  RENDER_QUEUE,
  config,
  redisConnection,
  type RenderJobData,
} from '@editor-video/core';
import { prisma, ProjectKind } from '@editor-video/db';
import { runAmbientPipeline } from './ambient/pipeline.js';
import { assertFfmpegAvailable } from './ffmpeg.js';
import { markProjectFailed, runRenderPipeline } from './pipeline.js';
import { runCuriosidadePipeline } from './v2/pipeline-curiosidade.js';
import { logger } from './logger.js';

const log = logger('worker');

async function main(): Promise<void> {
  await assertFfmpegAvailable();
  log.info(`FFmpeg OK. Conectando em ${config.redisUrl}`);

  const worker = new Worker<RenderJobData>(
    RENDER_QUEUE,
    async (job: Job<RenderJobData>) => {
      const { projectId } = job.data;
      log.info(`job ${job.id}: iniciando projeto ${projectId} (tentativa ${job.attemptsMade + 1})`);

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, kind: true },
      });
      if (!project) {
        // Job órfão (projeto apagado enquanto estava na fila) — não retentar.
        throw new UnrecoverableError(
          `Projeto ${projectId} não encontrado (provavelmente foi apagado).`,
        );
      }

      if (project.kind === ProjectKind.CURIOSIDADE) {
        await runCuriosidadePipeline(projectId);
      } else if (project.kind === ProjectKind.AMBIENT) {
        await runAmbientPipeline(projectId, job.data.ambientMode ?? 'preview');
      } else {
        await runRenderPipeline(projectId);
      }
    },
    {
      connection: redisConnection(),
      concurrency: config.render.concurrency,
      // Ambient pode renderizar horas; Curiosidade/TopList também precisam de lock longo.
      lockDuration: 6 * 60 * 60 * 1000,
      stalledInterval: 60 * 1000,
    },
  );

  worker.on('completed', (job) => log.info(`job ${job.id}: concluído`));

  worker.on('failed', (job, err) => {
    log.error(`job ${job?.id}: falhou — ${err.message}`);
    if (!job) return;
    // Projetos apagados: só registra, sem tentar UPDATE no banco.
    if (err.message.includes('não encontrado')) {
      return;
    }
    // Só marca FAILED quando não há mais retentativas pendentes.
    const attemptsLeft = (job.opts.attempts ?? 1) - (job.attemptsMade ?? 0);
    if (attemptsLeft <= 0) {
      void markProjectFailed(job.data.projectId, err.message);
    }
  });

  worker.on('error', (err) => log.error('erro na conexão do worker', err));

  log.info(`Worker ouvindo a fila "${RENDER_QUEUE}" (concorrência ${config.render.concurrency})`);

  const shutdown = async (signal: string): Promise<void> => {
    log.info(`${signal} recebido, encerrando...`);
    await worker.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  log.error('falha fatal na inicialização', err);
  process.exit(1);
});
