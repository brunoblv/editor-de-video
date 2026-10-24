import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { commitPatch, getRevisionDocument, listRevisions, restoreProjectRevision } from '@editor-video/db/v3';
import { operationSchema } from '@editor-video/timeline';
import { body, ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

/** Histórico; com ?revisionId= devolve o documento daquela revisão (comparação). */
export async function GET(request: NextRequest, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    const revisionId = request.nextUrl.searchParams.get('revisionId');
    if (revisionId) return ok({ document: await getRevisionDocument(actor, id, revisionId) });
    return ok({ revisions: await listRevisions(actor, id) });
  });
}

const patchSchema = z.object({
  expectedRevisionId: z.string(),
  operations: z.array(operationSchema).min(1).max(500),
  summary: z.string().max(500).optional(),
});
const restoreSchema = z.object({ restoreRevisionId: z.string(), expectedRevisionId: z.string() });

/**
 * Aplica patch com expectedRevisionId (edição manual). Em conflito: 409 com a
 * revisão atual para o cliente recalcular. Também restaura revisões.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    const input = await body<Record<string, unknown>>(request);
    if ('restoreRevisionId' in input) {
      const r = restoreSchema.parse(input);
      return ok(await restoreProjectRevision(actor, id, r.restoreRevisionId, r.expectedRevisionId), 201);
    }
    const patch = patchSchema.parse(input);
    const result = await commitPatch(actor, id, {
      expectedRevisionId: patch.expectedRevisionId,
      operations: patch.operations,
      origin: { author: 'human', userId: actor.userId },
      summary: patch.summary,
    });
    return ok(result, 201);
  });
}
