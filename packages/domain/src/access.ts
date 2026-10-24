/**
 * Papéis por workspace (§12: proprietário, editor e revisor) e erros de
 * domínio com categorias distinguíveis pela API (§13).
 */

export const ROLES = ['OWNER', 'EDITOR', 'REVIEWER'] as const;
export type Role = (typeof ROLES)[number];

export type Action =
  | 'channel.manage'
  | 'account.manage'
  | 'project.edit'
  | 'project.view'
  | 'asset.upload'
  | 'render.request'
  | 'deliverable.approve'
  | 'publication.schedule'
  | 'migration.run';

const MATRIX: Record<Role, readonly Action[]> = {
  OWNER: [
    'channel.manage',
    'account.manage',
    'project.edit',
    'project.view',
    'asset.upload',
    'render.request',
    'deliverable.approve',
    'publication.schedule',
    'migration.run',
  ],
  EDITOR: ['project.edit', 'project.view', 'asset.upload', 'render.request'],
  REVIEWER: ['project.view', 'deliverable.approve'],
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[role].includes(action);
}

export type DomainErrorCode =
  | 'CONFLICT'
  | 'LIMIT'
  | 'DEPENDENCY_MISSING'
  | 'TRANSIENT'
  | 'INVALID'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'UNAUTHENTICATED'
  | 'LOCKED';

export const DOMAIN_ERROR_STATUS: Record<DomainErrorCode, number> = {
  CONFLICT: 409,
  LIMIT: 429,
  DEPENDENCY_MISSING: 424,
  TRANSIENT: 503,
  INVALID: 422,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  UNAUTHENTICATED: 401,
  LOCKED: 423,
};

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }

  get status(): number {
    return DOMAIN_ERROR_STATUS[this.code];
  }
}
