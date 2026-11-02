/**
 * Máquinas de estado separadas por objeto (§7). Uma falha de job não apaga
 * revisão nem arquivos válidos; render concluído não autoriza publicação.
 */

export const PROJECT_STATES = ['DRAFT', 'EDITING', 'IN_REVIEW', 'APPROVED', 'ARCHIVED'] as const;
export const JOB_STATES = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED'] as const;
export const DELIVERABLE_STATES = ['PENDING', 'RENDERING', 'VALIDATING', 'READY', 'FAILED', 'SUPERSEDED'] as const;
export const PUBLICATION_STATES = [
  'DRAFT',
  'APPROVED',
  'SCHEDULED',
  'UPLOADING',
  'PROCESSING_REMOTE',
  'PUBLISHED',
  'FAILED',
  'UNKNOWN',
  'CANCELLED',
] as const;

export const SOCIAL_POST_STATES = ['DRAFT', 'SCHEDULED', 'POSTED', 'CANCELLED'] as const;

export type ProjectState = (typeof PROJECT_STATES)[number];
export type JobState = (typeof JOB_STATES)[number];
export type DeliverableState = (typeof DELIVERABLE_STATES)[number];
export type PublicationState = (typeof PUBLICATION_STATES)[number];
export type SocialPostState = (typeof SOCIAL_POST_STATES)[number];

type Transitions<S extends string> = Record<S, readonly S[]>;

export const PROJECT_TRANSITIONS: Transitions<ProjectState> = {
  DRAFT: ['EDITING', 'ARCHIVED'],
  EDITING: ['IN_REVIEW', 'ARCHIVED'],
  // Nova edição durante revisão volta para EDITING.
  IN_REVIEW: ['EDITING', 'APPROVED', 'ARCHIVED'],
  APPROVED: ['EDITING', 'ARCHIVED'],
  ARCHIVED: ['EDITING'],
};

export const JOB_TRANSITIONS: Transitions<JobState> = {
  QUEUED: ['RUNNING', 'CANCEL_REQUESTED', 'CANCELLED'],
  RUNNING: ['SUCCEEDED', 'FAILED', 'CANCEL_REQUESTED'],
  CANCEL_REQUESTED: ['CANCELLED', 'FAILED', 'SUCCEEDED'],
  // Retry controlado: FAILED volta à fila explicitamente.
  FAILED: ['QUEUED'],
  SUCCEEDED: [],
  CANCELLED: ['QUEUED'],
};

export const DELIVERABLE_TRANSITIONS: Transitions<DeliverableState> = {
  PENDING: ['RENDERING', 'FAILED', 'SUPERSEDED'],
  RENDERING: ['VALIDATING', 'FAILED', 'SUPERSEDED'],
  VALIDATING: ['READY', 'FAILED', 'SUPERSEDED'],
  READY: ['SUPERSEDED'],
  FAILED: ['PENDING', 'SUPERSEDED'],
  SUPERSEDED: [],
};

export const PUBLICATION_TRANSITIONS: Transitions<PublicationState> = {
  DRAFT: ['APPROVED', 'CANCELLED'],
  // Mudança de metadados/capa/destino volta para DRAFT (invalida aprovação).
  APPROVED: ['SCHEDULED', 'UPLOADING', 'DRAFT', 'CANCELLED'],
  SCHEDULED: ['UPLOADING', 'DRAFT', 'CANCELLED'],
  UPLOADING: ['PROCESSING_REMOTE', 'PUBLISHED', 'FAILED', 'UNKNOWN'],
  PROCESSING_REMOTE: ['PUBLISHED', 'FAILED', 'UNKNOWN'],
  PUBLISHED: [],
  FAILED: ['DRAFT', 'APPROVED', 'CANCELLED'],
  // Resultado incerto: só sai daqui por reconciliação com o estado remoto.
  UNKNOWN: ['PUBLISHED', 'PROCESSING_REMOTE', 'FAILED'],
  CANCELLED: [],
};

export const SOCIAL_POST_TRANSITIONS: Transitions<SocialPostState> = {
  DRAFT: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['DRAFT', 'POSTED', 'CANCELLED'],
  // Desmarcar uma rede postada por engano volta para a agenda.
  POSTED: ['SCHEDULED'],
  CANCELLED: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly entity: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`Transição inválida de ${entity}: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition<S extends string>(table: Transitions<S>, from: S, to: S): boolean {
  return table[from].includes(to);
}

export function assertTransition<S extends string>(entity: string, table: Transitions<S>, from: S, to: S): S {
  if (!canTransition(table, from, to)) throw new InvalidTransitionError(entity, from, to);
  return to;
}

export const TERMINAL_JOB_STATES: readonly JobState[] = ['SUCCEEDED', 'FAILED', 'CANCELLED'];
