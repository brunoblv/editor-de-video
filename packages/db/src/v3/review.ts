/**
 * Entregas, aprovação vinculada e publicações (§7, §14.3, §17).
 * - Render concluído NÃO autoriza publicação.
 * - Aprovação vale para hash da entrega + conta + metadados exatos (AC-10).
 * - Publicação aponta para uma entrega específica, nunca "a mais recente".
 * - Agendar exige aprovação válida no momento do agendamento E do envio.
 */
import {
  approvalFingerprint,
  assertTransition,
  DomainError,
  isApprovalValid,
  publicationKey,
  publicationMetadataSchema,
  PUBLICATION_TRANSITIONS,
  type PublicationMetadata,
  type PublicationState,
} from '@editor-video/domain';
import type { Prisma } from '@prisma/client';
import { prisma } from '../client.js';
import { authorizeDeliverable, authorizeProject, authorizeSocialAccount, requireRole, type Actor } from './access.js';

const json = (v: unknown) => v as Prisma.InputJsonValue;

export async function listDeliverables(actor: Actor, projectId: string) {
  await authorizeProject(actor, projectId, 'project.view');
  return prisma.deliverable.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    include: { approvals: { orderBy: { createdAt: 'desc' }, take: 5 }, revision: { select: { number: true } } },
  });
}

export type ApprovalInput = {
  deliverableId: string;
  socialAccountId: string;
  metadata: unknown;
  decision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';
  note?: string | null;
};

export async function recordApproval(actor: Actor, input: ApprovalInput) {
  const deliverable = await authorizeDeliverable(actor, input.deliverableId, 'deliverable.approve');
  if (deliverable.kind !== 'FINAL') throw new DomainError('INVALID', 'Prévia não equivale a entrega final aprovável.');
  if (deliverable.state !== 'READY' || !deliverable.sha256) throw new DomainError('CONFLICT', 'A entrega ainda não está pronta e validada.');
  const account = await authorizeSocialAccount(actor, input.socialAccountId, 'project.view');
  if (account.workspaceId !== deliverable.project.workspaceId) throw new DomainError('FORBIDDEN', 'Conta de outro workspace.');
  const metadata = publicationMetadataSchema.parse(input.metadata);
  const fingerprint = approvalFingerprint({ deliverableId: deliverable.id, deliverableHash: deliverable.sha256, socialAccountId: account.id, metadata });
  return prisma.reviewApproval.create({
    data: {
      deliverableId: deliverable.id,
      socialAccountId: account.id,
      fingerprint,
      metadataJson: json(metadata),
      decision: input.decision,
      reviewerId: actor.userId,
      note: input.note ?? null,
    },
  });
}

export type PublicationDraftInput = {
  deliverableId: string;
  socialAccountId: string;
  metadata: unknown;
  intent?: string;
};

/** Rascunho de publicação (prepare_publication). Nunca publica. */
export async function createPublicationDraft(actor: Actor, input: PublicationDraftInput) {
  const deliverable = await authorizeDeliverable(actor, input.deliverableId, 'project.edit');
  const account = await authorizeSocialAccount(actor, input.socialAccountId, 'project.view');
  if (account.workspaceId !== deliverable.project.workspaceId) throw new DomainError('FORBIDDEN', 'Conta de outro workspace.');
  if (account.channelId && account.channelId !== deliverable.project.channelId) {
    throw new DomainError('CONFLICT', 'A conta está associada a outro canal editorial.');
  }
  const metadata = publicationMetadataSchema.parse(input.metadata);
  const key = publicationKey({ deliverableId: deliverable.id, socialAccountId: account.id, intent: input.intent ?? 'main' });
  const existing = await prisma.publication.findUnique({ where: { publicationKey: key } });
  if (existing) return existing;
  return prisma.publication.create({
    data: {
      projectId: deliverable.projectId,
      deliverableId: deliverable.id,
      socialAccountId: account.id,
      platform: account.platform,
      state: 'DRAFT',
      publicationKey: key,
      intent: input.intent ?? 'main',
      metadataJson: json(metadata),
    },
  });
}

async function loadPublication(actor: Actor, publicationId: string) {
  const publication = await prisma.publication.findUnique({
    where: { id: publicationId },
    include: { project: true, deliverable: true, socialAccount: true },
  });
  if (!publication) throw new DomainError('NOT_FOUND', 'Publicação não encontrada.');
  await requireRole(actor, publication.project.workspaceId, 'publication.schedule');
  return publication;
}

/** Confere se existe aprovação válida para a publicação como está agora. */
export async function findValidApproval(publication: { deliverableId: string | null; socialAccountId: string | null; metadataJson: unknown }) {
  if (!publication.deliverableId || !publication.socialAccountId) return null;
  const deliverable = await prisma.deliverable.findUnique({ where: { id: publication.deliverableId } });
  if (!deliverable?.sha256 || deliverable.state !== 'READY') return null;
  const metadata = publicationMetadataSchema.parse(publication.metadataJson ?? {});
  const subject = { deliverableId: deliverable.id, deliverableHash: deliverable.sha256, socialAccountId: publication.socialAccountId, metadata };
  const approvals = await prisma.reviewApproval.findMany({ where: { deliverableId: deliverable.id, socialAccountId: publication.socialAccountId, decision: 'APPROVED', revokedAt: null }, orderBy: { createdAt: 'desc' } });
  return approvals.find((a) => isApprovalValid({ fingerprint: a.fingerprint, decision: a.decision, revokedAt: a.revokedAt }, subject)) ?? null;
}

/** Alterar metadados/capa/privacidade volta para DRAFT e invalida a aprovação. */
export async function updatePublicationMetadata(actor: Actor, publicationId: string, metadataInput: unknown) {
  const publication = await loadPublication(actor, publicationId);
  if (!['DRAFT', 'APPROVED', 'SCHEDULED', 'FAILED'].includes(publication.state)) {
    throw new DomainError('CONFLICT', `Publicação em ${publication.state} não pode ser alterada.`);
  }
  const metadata: PublicationMetadata = publicationMetadataSchema.parse(metadataInput);
  return prisma.publication.update({
    where: { id: publicationId },
    data: { metadataJson: json(metadata), state: 'DRAFT', approvalId: null, scheduledAt: null },
  });
}

export async function markPublicationApproved(actor: Actor, publicationId: string) {
  const publication = await loadPublication(actor, publicationId);
  const approval = await findValidApproval(publication);
  if (!approval) throw new DomainError('CONFLICT', 'Não há aprovação válida para esta entrega, conta e metadados.');
  assertTransition('Publicação', PUBLICATION_TRANSITIONS, publication.state as PublicationState, 'APPROVED');
  return prisma.publication.update({ where: { id: publicationId }, data: { state: 'APPROVED', approvalId: approval.id } });
}

export async function schedulePublication(actor: Actor, publicationId: string, scheduledAt: Date) {
  const publication = await loadPublication(actor, publicationId);
  if (publication.socialAccount?.status !== 'CONNECTED') throw new DomainError('DEPENDENCY_MISSING', 'Conta de destino desconectada; reconecte antes de agendar.');
  if (scheduledAt.getTime() < Date.now() - 60_000) throw new DomainError('INVALID', 'Horário no passado.');
  const approval = await findValidApproval(publication);
  if (!approval) throw new DomainError('CONFLICT', 'Aprovação ausente ou invalidada por mudança na entrega/metadados.');
  const from = publication.state as PublicationState;
  if (from === 'DRAFT') assertTransition('Publicação', PUBLICATION_TRANSITIONS, from, 'APPROVED');
  else if (from !== 'APPROVED' && from !== 'SCHEDULED') assertTransition('Publicação', PUBLICATION_TRANSITIONS, from, 'SCHEDULED');
  return prisma.publication.update({ where: { id: publicationId }, data: { state: 'SCHEDULED', scheduledAt, approvalId: approval.id } });
}

export async function cancelPublication(actor: Actor, publicationId: string) {
  const publication = await loadPublication(actor, publicationId);
  assertTransition('Publicação', PUBLICATION_TRANSITIONS, publication.state as PublicationState, 'CANCELLED');
  return prisma.publication.update({ where: { id: publicationId }, data: { state: 'CANCELLED' } });
}

export async function listCalendar(actor: Actor, range: { from: Date; to: Date; channelId?: string; platform?: string; state?: string }) {
  const memberships = await prisma.membership.findMany({ where: { userId: actor.userId }, select: { workspaceId: true } });
  return prisma.publication.findMany({
    where: {
      project: { workspaceId: { in: memberships.map((m) => m.workspaceId) }, ...(range.channelId ? { channelId: range.channelId } : {}) },
      OR: [
        { scheduledAt: { gte: range.from, lt: range.to } },
        { publishedAt: { gte: range.from, lt: range.to } },
        { requestedScheduleAt: { gte: range.from, lt: range.to } },
      ],
      ...(range.platform ? { platform: range.platform as never } : {}),
      ...(range.state ? { state: range.state as never } : {}),
    },
    orderBy: { scheduledAt: 'asc' },
    include: {
      project: { select: { id: true, title: true, channel: { select: { id: true, name: true, slug: true } } } },
      socialAccount: { select: { id: true, displayName: true, platform: true, status: true } },
      deliverable: { select: { id: true, variantId: true, width: true, height: true, durationSec: true } },
    },
  });
}
