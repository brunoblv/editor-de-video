/**
 * Registro de execuções do agente (RF-20 / AC-18): comando, modelo,
 * ferramentas, consumo, duração, versão e falhas, associados ao projeto.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../client.js';
import { authorizeProject, type Actor } from './access.js';

const json = (v: unknown) => v as Prisma.InputJsonValue;

export async function startAgentRun(actor: Actor, projectId: string, input: { command: string; model: string; baseRevisionId: string | null; sdkVersion?: string }) {
  await authorizeProject(actor, projectId, 'project.edit');
  return prisma.agentRun.create({
    data: {
      projectId,
      userId: actor.userId,
      command: input.command.slice(0, 8000),
      model: input.model,
      baseRevisionId: input.baseRevisionId,
      sdkVersion: input.sdkVersion ?? null,
    },
  });
}

export type AgentRunResult = {
  state: 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  responseText?: string | null;
  resultRevisionId?: string | null;
  plan?: unknown;
  toolCalls?: unknown[];
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheReadTokens?: number | null;
  costUsd?: number | null;
  durationMs?: number | null;
  numTurns?: number | null;
  sessionId?: string | null;
  errorMessage?: string | null;
};

export async function finishAgentRun(runId: string, result: AgentRunResult) {
  return prisma.agentRun.update({
    where: { id: runId },
    data: {
      state: result.state,
      responseText: result.responseText ?? null,
      resultRevisionId: result.resultRevisionId ?? null,
      planJson: result.plan !== undefined ? json(result.plan) : undefined,
      toolCallsJson: result.toolCalls ? json(result.toolCalls) : undefined,
      inputTokens: result.inputTokens ?? null,
      outputTokens: result.outputTokens ?? null,
      cacheReadTokens: result.cacheReadTokens ?? null,
      costUsd: result.costUsd ?? null,
      durationMs: result.durationMs ?? null,
      numTurns: result.numTurns ?? null,
      sessionId: result.sessionId ?? null,
      errorMessage: result.errorMessage?.slice(0, 4000) ?? null,
      finishedAt: new Date(),
    },
  });
}

export async function listAgentRuns(actor: Actor, projectId: string) {
  await authorizeProject(actor, projectId, 'project.view');
  return prisma.agentRun.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' }, take: 50 });
}

/** Custos e duração agregados por projeto (AC-18). */
export async function projectUsage(actor: Actor, projectId: string) {
  await authorizeProject(actor, projectId, 'project.view');
  const [agent, jobs] = await Promise.all([
    prisma.agentRun.aggregate({ where: { projectId }, _sum: { costUsd: true, inputTokens: true, outputTokens: true, durationMs: true }, _count: true }),
    prisma.renderJob.findMany({ where: { projectId, finishedAt: { not: null }, startedAt: { not: null } }, select: { kind: true, startedAt: true, finishedAt: true } }),
  ]);
  const jobSeconds = jobs.reduce((s, j) => s + (j.finishedAt!.getTime() - j.startedAt!.getTime()) / 1000, 0);
  return {
    agentRuns: agent._count,
    costUsd: agent._sum.costUsd ?? 0,
    inputTokens: agent._sum.inputTokens ?? 0,
    outputTokens: agent._sum.outputTokens ?? 0,
    agentDurationMs: agent._sum.durationMs ?? 0,
    jobCount: jobs.length,
    jobSeconds,
  };
}
