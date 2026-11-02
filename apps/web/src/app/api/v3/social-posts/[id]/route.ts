import { z } from 'zod';
import { cancelSocialPost, scheduleSocialPost, setSocialPostTargetPosted, unscheduleSocialPost, updateSocialPost } from '@editor-video/db/v3';
import { SOCIAL_PLATFORMS } from '@editor-video/domain';
import { body, ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return ok({ post: await updateSocialPost(actor, id, await body(request)) });
  });
}

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('schedule'), scheduledAt: z.iso.datetime({ offset: true }) }),
  z.object({ action: z.literal('unschedule') }),
  z.object({ action: z.literal('cancel') }),
  z.object({
    action: z.literal('mark'),
    platform: z.enum(SOCIAL_PLATFORMS),
    posted: z.boolean(),
    // Vira link na interface: só http(s).
    remoteUrl: z.string().max(2000).regex(/^https?:\/\//i).nullable().optional(),
  }),
]);

export async function POST(request: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    const input = actionSchema.parse(await body(request));
    switch (input.action) {
      case 'schedule':
        return ok({ post: await scheduleSocialPost(actor, id, new Date(input.scheduledAt)) });
      case 'unschedule':
        return ok({ post: await unscheduleSocialPost(actor, id) });
      case 'cancel':
        return ok({ post: await cancelSocialPost(actor, id) });
      case 'mark':
        return ok({ post: await setSocialPostTargetPosted(actor, id, input) });
    }
  });
}
