import { z } from 'zod';
import { getProject, setProjectState } from '@editor-video/db/v3';
import { PROJECT_STATES } from '@editor-video/domain';
import { body, ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

/** Estado do projeto + revisão atual (documento da timeline). */
export async function GET(_req: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return ok({ project: await getProject(actor, id) });
  });
}

const patchSchema = z.object({ state: z.enum(PROJECT_STATES) });

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    const { state } = patchSchema.parse(await body(request));
    return ok({ project: await setProjectState(actor, id, state) });
  });
}
