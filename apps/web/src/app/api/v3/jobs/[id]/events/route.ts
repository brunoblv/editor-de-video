import { getJobSnapshot } from '@editor-video/db/v3';
import { TERMINAL_JOB_STATES, type JobState } from '@editor-video/domain';
import { requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Params = { params: Promise<{ id: string }> };

/**
 * Progresso por SSE (§10). Lê o estado persistido (fonte oficial) e envia
 * quando muda; encerra em estado terminal. `workerOffline` sinaliza
 * heartbeat parado — a interface nunca fica eternamente "processando".
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    await getJobSnapshot(actor, id);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let last = '';
        const started = Date.now();
        try {
          while (!request.signal.aborted && Date.now() - started < 30 * 60_000) {
            const snapshot = await getJobSnapshot(actor, id);
            const serialized = JSON.stringify(snapshot);
            if (serialized !== last) {
              controller.enqueue(encoder.encode(`data: ${serialized}\n\n`));
              last = serialized;
            } else {
              controller.enqueue(encoder.encode(': keep-alive\n\n'));
            }
            if (TERMINAL_JOB_STATES.includes(snapshot.state as JobState)) break;
            await new Promise((r) => setTimeout(r, 1000));
          }
        } catch (err) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: (err as Error).message })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' } });
  });
}
