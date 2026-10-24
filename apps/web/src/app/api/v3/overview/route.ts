import { prisma } from '@editor-video/db';
import { HEARTBEAT_STALE_MS, listWorkspaceIds } from '@editor-video/db/v3';
import { ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';

/**
 * Visão geral (§14.1): continuar edição, entregas aguardando revisão, erros
 * acionáveis, próximos agendamentos e capacidade do worker. Sem métricas
 * que ainda não existem.
 */
export async function GET(): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const ws = await listWorkspaceIds(actor);
    const inWs = { project: { workspaceId: { in: ws } } };
    const [continueEditing, awaitingReview, failedJobs, upcoming, running, pendingSchedules, disconnected] = await Promise.all([
      prisma.videoProject.findMany({ where: { workspaceId: { in: ws }, state: { in: ['DRAFT', 'EDITING'] }, legacyReadOnly: false }, orderBy: { updatedAt: 'desc' }, take: 6, include: { channel: { select: { name: true, slug: true } } } }),
      prisma.deliverable.findMany({ where: { ...inWs, kind: 'FINAL', state: 'READY', approvals: { none: {} } }, orderBy: { createdAt: 'desc' }, take: 10, include: { project: { select: { id: true, title: true, channel: { select: { name: true } } } } } }),
      prisma.renderJob.findMany({ where: { ...inWs, state: 'FAILED', finishedAt: { gte: new Date(Date.now() - 7 * 86400_000) } }, orderBy: { finishedAt: 'desc' }, take: 10, include: { project: { select: { id: true, title: true } } } }),
      prisma.publication.findMany({ where: { ...inWs, state: 'SCHEDULED', scheduledAt: { gte: new Date() } }, orderBy: { scheduledAt: 'asc' }, take: 10, include: { socialAccount: { select: { displayName: true, platform: true } }, project: { select: { title: true, channel: { select: { name: true } } } } } }),
      prisma.renderJob.findMany({ where: { ...inWs, state: { in: ['RUNNING', 'CANCEL_REQUESTED'] } }, select: { id: true, heartbeatAt: true, leaseOwner: true, queue: true } }),
      prisma.publication.count({ where: { ...inWs, state: 'DRAFT', requestedScheduleAt: { not: null } } }),
      prisma.socialAccount.findMany({ where: { workspaceId: { in: ws }, status: { not: 'CONNECTED' } }, select: { id: true, displayName: true, platform: true, status: true } }),
    ]);
    const queued = await prisma.renderJob.groupBy({ by: ['queue'], where: { ...inWs, state: 'QUEUED' }, _count: true });
    const workers = new Set(running.filter((j) => j.heartbeatAt && Date.now() - j.heartbeatAt.getTime() < HEARTBEAT_STALE_MS).map((j) => j.leaseOwner));
    const stalled = running.filter((j) => !j.heartbeatAt || Date.now() - j.heartbeatAt.getTime() >= HEARTBEAT_STALE_MS).length;
    return ok({
      continueEditing,
      awaitingReview,
      failedJobs,
      upcoming,
      pendingSchedules,
      disconnectedAccounts: disconnected,
      capacity: { activeWorkers: workers.size, running: running.length, stalled, queued: Object.fromEntries(queued.map((q) => [q.queue, q._count])) },
    });
  });
}
