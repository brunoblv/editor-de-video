import type { NextRequest } from 'next/server';
import { listJobs } from '@editor-video/db/v3';
import { JOB_STATES } from '@editor-video/domain';
import { ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const state = JOB_STATES.find((s) => s === request.nextUrl.searchParams.get('state'));
    return ok({ jobs: await listJobs(actor, { state }) });
  });
}
