/**
 * Aprovação vinculada (RF-17 / AC-10): a aprovação vale para um hash de
 * entrega E um conjunto exato de metadados de distribuição. Qualquer mudança
 * no arquivo, capa, destino, privacidade ou texto gera outra impressão
 * digital e invalida a aprovação anterior.
 */
import { z } from 'zod';
import { hashObject } from './hashing.js';

export const publicationMetadataSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).default(''),
  tags: z.array(z.string().max(100)).max(50).default([]),
  privacy: z.enum(['public', 'unlisted', 'private']).default('private'),
  language: z.string().min(2).max(16).default('pt-BR'),
  /** sha256 da capa; null = capa automática da plataforma. */
  coverHash: z.string().nullable().default(null),
  playlistIds: z.array(z.string()).default([]),
  madeForKids: z.boolean().default(false),
  captionsDeliverableId: z.string().nullable().default(null),
});

export type PublicationMetadata = z.infer<typeof publicationMetadataSchema>;

export type ApprovalSubject = {
  deliverableId: string;
  deliverableHash: string;
  socialAccountId: string;
  metadata: PublicationMetadata;
};

export function approvalFingerprint(subject: ApprovalSubject): string {
  return hashObject({
    v: 1,
    deliverableId: subject.deliverableId,
    deliverableHash: subject.deliverableHash,
    socialAccountId: subject.socialAccountId,
    metadata: publicationMetadataSchema.parse(subject.metadata),
  });
}

export type StoredApproval = {
  fingerprint: string;
  decision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';
  revokedAt?: Date | null;
};

export function isApprovalValid(approval: StoredApproval | null | undefined, subject: ApprovalSubject): boolean {
  if (!approval || approval.decision !== 'APPROVED' || approval.revokedAt) return false;
  return approval.fingerprint === approvalFingerprint(subject);
}
