/**
 * Autorização por workspace em TODA referência (§19 / AC-12). Cada recurso
 * é resolvido até o workspace dono e conferido contra a membership do
 * usuário e a matriz de papéis do domínio.
 */
import { can, DomainError, type Action, type Role } from '@editor-video/domain';
import { prisma } from '../client.js';

export type Actor = { userId: string };

export async function requireRole(actor: Actor, workspaceId: string, action: Action): Promise<Role> {
  const membership = await prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: actor.userId } },
  });
  // Mesmo erro para "não existe" e "sem acesso": não vaza a existência de recursos alheios.
  if (!membership) throw new DomainError('NOT_FOUND', 'Recurso não encontrado.');
  if (!can(membership.role, action)) throw new DomainError('FORBIDDEN', 'Seu papel não permite esta ação.');
  return membership.role;
}

export async function listWorkspaceIds(actor: Actor): Promise<string[]> {
  const rows = await prisma.membership.findMany({ where: { userId: actor.userId }, select: { workspaceId: true } });
  return rows.map((r) => r.workspaceId);
}

async function ownerOf<T extends { workspaceId: string }>(row: T | null, label: string): Promise<T> {
  if (!row) throw new DomainError('NOT_FOUND', `${label} não encontrado.`);
  return row;
}

export async function authorizeChannel(actor: Actor, channelId: string, action: Action) {
  const channel = await ownerOf(await prisma.channel.findUnique({ where: { id: channelId } }), 'Canal');
  await requireRole(actor, channel.workspaceId, action);
  return channel;
}

export async function authorizeProject(actor: Actor, projectId: string, action: Action) {
  const project = await ownerOf(await prisma.videoProject.findUnique({ where: { id: projectId } }), 'Projeto');
  await requireRole(actor, project.workspaceId, action);
  return project;
}

export async function authorizeAsset(actor: Actor, assetId: string, action: Action) {
  const asset = await ownerOf(await prisma.asset.findUnique({ where: { id: assetId } }), 'Asset');
  await requireRole(actor, asset.workspaceId, action);
  return asset;
}

export async function authorizeSocialAccount(actor: Actor, accountId: string, action: Action) {
  const account = await ownerOf(await prisma.socialAccount.findUnique({ where: { id: accountId } }), 'Conta');
  await requireRole(actor, account.workspaceId, action);
  return account;
}

export async function authorizeRevision(actor: Actor, revisionId: string, action: Action) {
  const revision = await prisma.timelineRevision.findUnique({ where: { id: revisionId }, include: { project: true } });
  if (!revision) throw new DomainError('NOT_FOUND', 'Revisão não encontrada.');
  await requireRole(actor, revision.project.workspaceId, action);
  return revision;
}

export async function authorizeDeliverable(actor: Actor, deliverableId: string, action: Action) {
  const deliverable = await prisma.deliverable.findUnique({ where: { id: deliverableId }, include: { project: true } });
  if (!deliverable) throw new DomainError('NOT_FOUND', 'Entrega não encontrada.');
  await requireRole(actor, deliverable.project.workspaceId, action);
  return deliverable;
}

export async function authorizeJob(actor: Actor, jobId: string, action: Action) {
  const job = await prisma.renderJob.findUnique({ where: { id: jobId }, include: { project: true } });
  if (!job) throw new DomainError('NOT_FOUND', 'Job não encontrado.');
  await requireRole(actor, job.project.workspaceId, action);
  return job;
}
