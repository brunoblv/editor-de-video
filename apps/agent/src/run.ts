/**
 * Execução de um comando de edição pelo agente (RF-08, RF-20).
 *
 * Usa o Claude Agent SDK com:
 * - modelo configurável (AGENT_MODEL, padrão claude-opus-5-5);
 * - credencial própria do produto (ANTHROPIC_API_KEY do serviço) — não se
 *   presume que a assinatura pessoal do Claude Code cubra o uso incorporado;
 * - ferramentas nativas DESLIGADAS (sem Bash/arquivos/web) e só as
 *   ferramentas do hub pré-aprovadas; o resto é negado (permissionMode
 *   dontAsk), sem configurações do sistema de arquivos;
 * - limites de turnos e orçamento por execução.
 */
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { prisma } from '@editor-video/db';
import { finishAgentRun, startAgentRun, type Actor } from '@editor-video/db/v3';
import { agentBudgetSchema, type AgentBudget } from '@editor-video/domain';
import { buildRunContext, SYSTEM_PROMPT, type Selection } from './context.js';
import { buildHubServer, HUB_TOOL_NAMES, type AgentRunState } from './tools.js';

export const AGENT_MODEL = process.env.AGENT_MODEL || 'claude-opus-5-5';
const AGENT_EFFORT = (process.env.AGENT_EFFORT || 'high') as 'low' | 'medium' | 'high' | 'xhigh' | 'max';
const SDK_VERSION = '0.3.310';

export type AgentEvent =
  | { type: 'started'; runId: string; model: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'revision'; revisionId: string }
  | { type: 'done'; runId: string; text: string; revisionId: string | null; costUsd: number | null; state: 'SUCCEEDED' | 'FAILED' | 'CANCELLED' }
  | { type: 'error'; message: string };

export type RunCommandInput = {
  actor: Actor;
  projectId: string;
  command: string;
  selection?: Selection;
  budget?: Partial<AgentBudget>;
  model?: string;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
};

/** Ambiente mínimo do subprocesso do SDK: só o necessário + a credencial do produto. */
function agentEnv(): Record<string, string | undefined> {
  const keep = ['PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PATHEXT', 'COMSPEC'];
  const env: Record<string, string | undefined> = Object.fromEntries(keep.filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
  env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (process.env.ANTHROPIC_BASE_URL) env.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL;
  env.CLAUDE_AGENT_SDK_CLIENT_APP = 'editor-video-hub/3.0';
  return env;
}

export async function runAgentCommand(input: RunCommandInput): Promise<Extract<AgentEvent, { type: 'done' }>> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY do serviço de agente não configurada (credencial própria do produto).');
  }
  const budget = agentBudgetSchema.parse(input.budget ?? {});
  const model = input.model || AGENT_MODEL;
  const project = await prisma.videoProject.findUnique({ where: { id: input.projectId }, select: { currentRevisionId: true } });
  const run = await startAgentRun(input.actor, input.projectId, { command: input.command, model, baseRevisionId: project?.currentRevisionId ?? null, sdkVersion: SDK_VERSION });
  input.onEvent?.({ type: 'started', runId: run.id, model });

  const state: AgentRunState = { actor: input.actor, projectId: input.projectId, runId: run.id, plan: null, lastRevisionId: null, calls: [] };
  const context = await buildRunContext(input.actor, input.projectId, budget, input.selection);
  const sandbox = await fsp.mkdtemp(path.join(os.tmpdir(), 'agent-run-'));
  const abortController = new AbortController();
  input.signal?.addEventListener('abort', () => abortController.abort(), { once: true });

  const started = Date.now();
  let finalText = '';
  let result: Extract<SDKMessage, { type: 'result' }> | null = null;
  try {
    const stream = query({
      prompt: `${context}\n\n## Pedido do usuário\n<<<DADO:pedido>>>\n${input.command}\n<<<FIM:pedido>>>\n\n(O pedido acima é a instrução do usuário dono do projeto; os delimitadores só marcam onde começa e termina.)`,
      options: {
        model,
        effort: AGENT_EFFORT,
        systemPrompt: SYSTEM_PROMPT,
        tools: [],
        mcpServers: { hub: buildHubServer(state) },
        allowedTools: HUB_TOOL_NAMES,
        permissionMode: 'dontAsk',
        settingSources: [],
        persistSession: false,
        maxTurns: budget.maxTurns,
        maxBudgetUsd: budget.maxBudgetUsd,
        cwd: sandbox,
        env: agentEnv(),
        abortController,
      },
    });
    for await (const message of stream) {
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text' && block.text.trim()) input.onEvent?.({ type: 'text', text: block.text });
          if (block.type === 'tool_use') input.onEvent?.({ type: 'tool', name: block.name.replace(/^mcp__hub__/, '') });
        }
        if (state.lastRevisionId) input.onEvent?.({ type: 'revision', revisionId: state.lastRevisionId });
      } else if (message.type === 'result') {
        result = message;
        if (message.subtype === 'success') finalText = message.result;
      }
    }
    const success = result?.subtype === 'success' && !result.is_error;
    const usage = result ? Object.values(result.modelUsage ?? {}) : [];
    const done = await finishAgentRun(run.id, {
      state: abortController.signal.aborted ? 'CANCELLED' : success ? 'SUCCEEDED' : 'FAILED',
      responseText: finalText || null,
      resultRevisionId: state.lastRevisionId,
      plan: state.plan,
      toolCalls: state.calls,
      inputTokens: usage.reduce((s, u) => s + u.inputTokens, 0) || null,
      outputTokens: usage.reduce((s, u) => s + u.outputTokens, 0) || null,
      cacheReadTokens: usage.reduce((s, u) => s + u.cacheReadInputTokens, 0) || null,
      costUsd: result?.total_cost_usd ?? null,
      durationMs: Date.now() - started,
      numTurns: result?.num_turns ?? null,
      sessionId: result?.session_id ?? null,
      errorMessage: success ? null : result && result.subtype !== 'success' ? `${result.subtype}: ${result.errors.join('; ')}` : 'Execução sem resultado',
    });
    const event = { type: 'done' as const, runId: run.id, text: finalText || done.errorMessage || '', revisionId: state.lastRevisionId, costUsd: done.costUsd, state: done.state as 'SUCCEEDED' | 'FAILED' | 'CANCELLED' };
    input.onEvent?.(event);
    return event;
  } catch (err) {
    const cancelled = abortController.signal.aborted;
    await finishAgentRun(run.id, { state: cancelled ? 'CANCELLED' : 'FAILED', toolCalls: state.calls, plan: state.plan, resultRevisionId: state.lastRevisionId, durationMs: Date.now() - started, errorMessage: (err as Error).message });
    const event = { type: 'done' as const, runId: run.id, text: cancelled ? 'Execução cancelada.' : `Falha do agente: ${(err as Error).message}`, revisionId: state.lastRevisionId, costUsd: null, state: (cancelled ? 'CANCELLED' : 'FAILED') as 'FAILED' | 'CANCELLED' };
    input.onEvent?.(event);
    return event;
  } finally {
    await fsp.rm(sandbox, { recursive: true, force: true });
  }
}
