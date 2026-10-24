/**
 * Serviço HTTP do agente (separado do web, §9/§10). Só aceita chamadas do
 * backend do hub com AGENT_SERVICE_TOKEN; o usuário já foi autenticado lá e
 * a autorização por workspace é refeita aqui em cada ferramenta.
 *
 *   POST /runs  { userId, projectId, command, selection?, budget? }
 *   → text/event-stream com eventos AgentEvent (started, text, tool, revision, done)
 */
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { agentBudgetSchema } from '@editor-video/domain';
import { runAgentCommand, AGENT_MODEL } from './run.js';

const PORT = Number(process.env.AGENT_PORT ?? 4100);
const TOKEN = process.env.AGENT_SERVICE_TOKEN ?? '';

const bodySchema = z.object({
  userId: z.string().min(1),
  projectId: z.string().min(1),
  command: z.string().min(1).max(8000),
  selection: z.object({ itemIds: z.array(z.string()).max(100).optional(), startFrame: z.number().int().nonnegative().optional(), endFrame: z.number().int().positive().optional() }).optional(),
  budget: agentBudgetSchema.partial().optional(),
});

function authorized(req: http.IncomingMessage): boolean {
  const header = req.headers.authorization ?? '';
  const given = Buffer.from(header.replace(/^Bearer /, ''));
  const expected = Buffer.from(TOKEN);
  return TOKEN.length >= 16 && given.length === expected.length && timingSafeEqual(given, expected);
}

async function readBody(req: http.IncomingMessage, limit = 64_000): Promise<string> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw new Error('Corpo muito grande');
  }
  return body;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, model: AGENT_MODEL, credential: Boolean(process.env.ANTHROPIC_API_KEY) }));
    return;
  }
  if (req.method !== 'POST' || req.url !== '/runs') {
    res.writeHead(404).end();
    return;
  }
  if (!authorized(req)) {
    res.writeHead(401).end();
    return;
  }
  let input: z.infer<typeof bodySchema>;
  try {
    input = bodySchema.parse(JSON.parse(await readBody(req)));
  } catch (err) {
    res.writeHead(422, { 'content-type': 'application/json' }).end(JSON.stringify({ error: (err as Error).message }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const controller = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  const send = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  try {
    await runAgentCommand({
      actor: { userId: input.userId },
      projectId: input.projectId,
      command: input.command,
      selection: input.selection,
      budget: input.budget,
      signal: controller.signal,
      onEvent: send,
    });
  } catch (err) {
    send({ type: 'error', message: (err as Error).message });
  } finally {
    res.end();
  }
});

if (TOKEN.length < 16) console.warn('[agent] AGENT_SERVICE_TOKEN ausente ou curto: todas as chamadas serão recusadas.');
server.listen(PORT, () => console.log(JSON.stringify({ level: 'info', service: 'agent', message: 'ouvindo', port: PORT, model: AGENT_MODEL })));
