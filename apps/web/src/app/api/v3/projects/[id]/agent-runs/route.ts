import { z } from 'zod';
import { authorizeProject, listAgentRuns } from '@editor-video/db/v3';
import { DomainError } from '@editor-video/domain';
import { body, ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return ok({ runs: await listAgentRuns(actor, id) });
  });
}

const schema = z.object({
  command: z.string().min(1).max(8000),
  selection: z.object({ itemIds: z.array(z.string()).max(100).optional(), startFrame: z.number().int().nonnegative().optional(), endFrame: z.number().int().positive().optional() }).optional(),
});

/**
 * Executa um comando de edição no serviço de agente (apps/agent) e repassa
 * os eventos por SSE. O token do serviço nunca chega ao navegador.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    await authorizeProject(actor, id, 'project.edit');
    const input = schema.parse(await body(request));
    const url = process.env.AGENT_SERVICE_URL ?? 'http://127.0.0.1:4100';
    const token = process.env.AGENT_SERVICE_TOKEN;
    if (!token) throw new DomainError('DEPENDENCY_MISSING', 'Serviço de agente não configurado (AGENT_SERVICE_TOKEN).');
    let upstream: Response;
    try {
      upstream = await fetch(`${url}/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: actor.userId, projectId: id, command: input.command, selection: input.selection }),
        signal: request.signal,
      });
    } catch {
      throw new DomainError('TRANSIENT', 'Serviço de agente indisponível. Verifique se apps/agent está rodando.');
    }
    if (!upstream.ok || !upstream.body) {
      throw new DomainError(upstream.status === 401 ? 'DEPENDENCY_MISSING' : 'TRANSIENT', `Serviço de agente respondeu ${upstream.status}.`);
    }
    return new Response(upstream.body, { status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } });
  });
}
