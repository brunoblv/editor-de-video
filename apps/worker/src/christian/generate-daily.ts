import { config, RENDER_QUEUE, redisConnection, type RenderJobData } from '@editor-video/core';
import { prisma, ProjectKind, ProjectStatus } from '@editor-video/db';
import { Queue } from 'bullmq';
import { logger } from '../logger.js';
import { selectPillar } from './planner.js';

const log = logger('christian:daily');

/**
 * Critério de sucesso do MVP (docs/Cristão/projeto.md §52):
 * `npm run generate:daily` cria um projeto Cristão, enfileira e o worker faz
 * o resto sozinho (Gemini → versículo → mídia → TTS → legendas → render →
 * QA). Nunca publica direto — cai em READY_FOR_REVIEW, como manda §7.
 */
async function main(): Promise<void> {
  const userId = config.christian.automationUserId || null;
  if (!userId) {
    log.warn(
      'CHRISTIAN_AUTOMATION_USER_ID não configurado — o projeto será criado sem dono (userId null).',
    );
  }

  const pillar = await selectPillar();
  log.info(`Pilar selecionado: ${pillar.label} (${pillar.id})`);

  const project = await prisma.project.create({
    data: {
      kind: ProjectKind.CHRISTIAN,
      title: pillar.label,
      pillar: pillar.id,
      watermark: config.christian.youtubeHandle || null,
      status: ProjectStatus.QUEUED,
      progress: 0,
      stage: 'Na fila',
      userId,
    },
  });

  const queue = new Queue<RenderJobData>(RENDER_QUEUE, { connection: redisConnection() });
  await queue.add(
    'render-project',
    { projectId: project.id },
    { jobId: `project-${project.id}-${Date.now()}`, attempts: config.ambient.maxRetries },
  );
  await queue.close();

  log.info(`Projeto ${project.id} enfileirado. Acompanhe o worker para o resultado.`);
}

main()
  .catch((err: unknown) => {
    log.error('Falha ao gerar conteúdo diário', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
