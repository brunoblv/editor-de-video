import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createProject, listProjects } from '@editor-video/db/v3';
import { PROJECT_STATES } from '@editor-video/domain';
import { body, ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const sp = request.nextUrl.searchParams;
    const state = PROJECT_STATES.find((s) => s === sp.get('state'));
    const projects = await listProjects(actor, { channelId: sp.get('channelId') ?? undefined, state, cursor: sp.get('cursor') ?? undefined });
    return ok({ projects, nextCursor: projects.length > 0 ? projects[projects.length - 1]!.id : null });
  });
}

const createSchema = z.object({
  channelId: z.string(),
  seriesId: z.string().nullable().optional(),
  title: z.string().min(1).max(200),
  briefing: z.string().max(20000).nullable().optional(),
  objective: z.string().max(500).nullable().optional(),
  targetDurationSec: z.number().int().positive().max(12 * 3600).nullable().optional(),
  formats: z.array(z.enum(['16:9', '9:16', '1:1', '4:5'])).min(1).max(4),
  templateVersionId: z.string().nullable().optional(),
});

export async function POST(request: Request): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    return ok({ project: await createProject(actor, createSchema.parse(await body(request))) }, 201);
  });
}
