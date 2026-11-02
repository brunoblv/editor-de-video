import { z } from 'zod';
import { createChannel, listChannels } from '@editor-video/db/v3';
import { body, ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    return ok({ channels: await listChannels(actor) });
  });
}

const createSchema = z.object({
  workspaceId: z.string().optional(),
  slug: z.string().min(2).max(60),
  name: z.string().min(1).max(120),
  languages: z.array(z.string().min(2).max(16)).min(1).max(10),
});

export async function POST(request: Request): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const input = createSchema.parse(await body(request));
    return ok({ channel: await createChannel(actor, input.workspaceId ?? actor.workspaceId, input) }, 201);
  });
}
