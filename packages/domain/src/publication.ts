/**
 * Publicação sem duplicação em retry (RF-18 / AC-11, §17).
 *
 * A chave de idempotência representa entrega + conta + intenção. Após um
 * timeout com resultado incerto a publicação fica UNKNOWN e o worker é
 * obrigado a reconciliar (sessão de upload retomável / busca do ID remoto)
 * antes de qualquer novo upload.
 */
import { hashObject } from './hashing.js';
import type { PublicationState } from './states.js';

export type PublicationIntent = {
  deliverableId: string;
  socialAccountId: string;
  /** Ex.: "main", "short", "reupload-2" — distinguir intenções legítimas. */
  intent: string;
};

export function publicationKey(intent: PublicationIntent): string {
  return `pub_${hashObject(intent).slice(0, 32)}`;
}

export type AttemptOutcome =
  | 'SUCCEEDED'
  | 'FAILED_PERMANENT'
  | 'FAILED_TRANSIENT'
  | 'TIMEOUT'
  | 'IN_PROGRESS';

export type AttemptRecord = {
  outcome: AttemptOutcome;
  /** URL da sessão de upload retomável, se a plataforma forneceu. */
  resumableSessionUrl?: string | null;
  remoteId?: string | null;
};

export type RetryDecision =
  | { action: 'NONE'; reason: string }
  | { action: 'RECONCILE'; reason: string; resumableSessionUrl?: string | null }
  | { action: 'RESUME_UPLOAD'; resumableSessionUrl: string }
  | { action: 'NEW_UPLOAD'; reason: string };

/**
 * Decide o próximo passo de uma publicação a partir do estado e da última
 * tentativa. Nunca devolve NEW_UPLOAD quando há chance de já existir vídeo
 * remoto.
 */
export function decideNextPublishStep(state: PublicationState, last: AttemptRecord | null): RetryDecision {
  if (state === 'PUBLISHED' || state === 'CANCELLED') {
    return { action: 'NONE', reason: `Publicação já está em ${state}` };
  }
  if (state !== 'UNKNOWN' && state !== 'FAILED' && state !== 'APPROVED' && state !== 'SCHEDULED') {
    return { action: 'NONE', reason: `Estado ${state} não permite nova tentativa` };
  }
  if (!last) return { action: 'NEW_UPLOAD', reason: 'Primeira tentativa' };
  if (last.remoteId) {
    return { action: 'RECONCILE', reason: 'Já existe ID remoto; confirmar estado na plataforma' };
  }
  if (state === 'UNKNOWN' || last.outcome === 'TIMEOUT' || last.outcome === 'IN_PROGRESS') {
    return {
      action: 'RECONCILE',
      reason: 'Resultado incerto: consultar sessão/ID remoto antes de repetir',
      resumableSessionUrl: last.resumableSessionUrl ?? null,
    };
  }
  if (last.outcome === 'FAILED_TRANSIENT' && last.resumableSessionUrl) {
    return { action: 'RESUME_UPLOAD', resumableSessionUrl: last.resumableSessionUrl };
  }
  if (last.outcome === 'FAILED_TRANSIENT') {
    return { action: 'NEW_UPLOAD', reason: 'Falha transitória confirmada antes do envio de bytes' };
  }
  return { action: 'NONE', reason: 'Falha permanente exige correção e nova aprovação' };
}

/** Resultado da reconciliação → próximo estado da publicação. */
export function stateAfterReconcile(
  found: { status: 'processing' | 'published' | 'failed' | 'not_found' } | null,
): PublicationState {
  if (!found) return 'UNKNOWN';
  switch (found.status) {
    case 'published':
      return 'PUBLISHED';
    case 'processing':
      return 'PROCESSING_REMOTE';
    case 'failed':
    case 'not_found':
      // Confirmado que não existe vídeo remoto: pode tentar de novo com segurança.
      return 'FAILED';
  }
}
