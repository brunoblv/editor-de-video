import { z } from 'zod';
import { getChannel, updateChannel } from '@editor-video/db/v3';
import { body, ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return ok({ channel: await getChannel(actor, id) });
  });
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  nameConfirmed: z.boolean().optional(),
  tagline: z.string().max(200).nullable().optional(),
  languages: z.array(z.string().min(2).max(16)).max(10).optional(),
  rules: z.unknown().optional(),
  linkedBrand: z.string().max(120).nullable().optional(),
  active: z.boolean().optional(),
  brandKit: z.object({ colors: z.record(z.string(), z.string().regex(/^#[0-9a-fA-F]{6}$/)), fonts: z.array(z.string().max(80)).max(10) }).optional(),
});

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return ok({ channel: await updateChannel(actor, id, patchSchema.parse(await body(request))) });
  });
}
