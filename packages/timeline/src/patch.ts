/**
 * Patches de timeline com concorrência otimista (§8):
 * - todo patch declara `expectedRevisionId`; se não for a revisão atual, é
 *   rejeitado com a revisão vigente para o chamador recalcular;
 * - operações sobre itens/trilhas bloqueados falham, exceto para humanos que
 *   desbloqueiam explicitamente (setLock) — o agente nunca desbloqueia (RF-10);
 * - o resultado inteiro é validado antes de virar nova revisão imutável.
 */
import { z } from 'zod';
import {
  applyOperation,
  isLocked,
  operationSchema,
  operationTargets,
  OperationError,
  type TimelineOperation,
} from './operations.js';
import { originSchema, type Origin, type TimelineDocument } from './schema.js';
import { computeDurationFrames, validateSemantics, type ValidationIssue } from './validate.js';

export const patchSchema = z.object({
  expectedRevisionId: z.string().min(1),
  operations: z.array(operationSchema).min(1).max(500),
  origin: originSchema,
});

export type TimelinePatch = z.infer<typeof patchSchema>;

export type PatchError =
  | { code: 'CONFLICT'; message: string; currentRevisionId: string }
  | { code: 'LOCKED'; message: string; targetIds: string[] }
  | { code: 'FORBIDDEN'; message: string }
  | { code: 'NOT_FOUND'; message: string; targetId?: string }
  | { code: 'INVALID'; message: string; issues: ValidationIssue[] };

export type PatchResult =
  | { ok: true; document: TimelineDocument; changedIds: string[] }
  | { ok: false; error: PatchError };

export type ApplyPatchOptions = {
  /** ID da revisão a ser criada (gerado pelo chamador/banco). */
  newRevisionId: string;
};

export function applyPatch(
  current: TimelineDocument,
  patchInput: TimelinePatch,
  options: ApplyPatchOptions,
): PatchResult {
  const patch = patchSchema.parse(patchInput);

  if (patch.expectedRevisionId !== current.revisionId) {
    return {
      ok: false,
      error: {
        code: 'CONFLICT',
        message: `A edição partiu da revisão ${patch.expectedRevisionId}, mas a atual é ${current.revisionId}. Recalcule a partir da revisão atual.`,
        currentRevisionId: current.revisionId,
      },
    };
  }

  const isAgent = patch.origin.author === 'agent';
  const draft = structuredClone(current);
  const changed = new Set<string>();

  for (const op of patch.operations) {
    if (op.op === 'setLock' && isAgent) {
      return {
        ok: false,
        error: { code: 'FORBIDDEN', message: 'O agente não pode bloquear ou desbloquear elementos.' },
      };
    }
    // Checa bloqueio no estado corrente do rascunho: um setLock(false) humano
    // anterior no mesmo patch libera as operações seguintes.
    if (op.op !== 'setLock') {
      const lockedTargets = operationTargets(draft, op).filter((t) => isLocked(draft, t));
      if (lockedTargets.length > 0) {
        return {
          ok: false,
          error: {
            code: 'LOCKED',
            message: `Elementos bloqueados: ${lockedTargets.join(', ')}. Desbloqueie explicitamente antes de alterar.`,
            targetIds: lockedTargets,
          },
        };
      }
    }
    try {
      applyOperation(draft, op);
    } catch (err) {
      if (err instanceof OperationError) {
        if (err.code === 'NOT_FOUND') {
          return { ok: false, error: { code: 'NOT_FOUND', message: err.message, targetId: err.targetId } };
        }
        return {
          ok: false,
          error: { code: 'INVALID', message: err.message, issues: [{ code: 'SCHEMA', message: err.message }] },
        };
      }
      throw err;
    }
    for (const target of operationTargets(current, op)) changed.add(target);
    if (op.op === 'insertClip') changed.add(op.item.id);
    if (op.op === 'splitClip') changed.add(op.newItemId);
  }

  draft.parentRevisionId = current.revisionId;
  draft.revisionId = options.newRevisionId;
  draft.origin = patch.origin;
  draft.video.durationFrames = computeDurationFrames(draft.tracks);

  const issues = validateSemantics(draft);
  if (issues.length > 0) {
    return {
      ok: false,
      error: { code: 'INVALID', message: 'O resultado da edição é inválido.', issues },
    };
  }

  return { ok: true, document: draft, changedIds: [...changed] };
}

/**
 * Restaurar uma revisão cria uma NOVA revisão com o conteúdo antigo,
 * apontando para a atual como pai — o histórico nunca é apagado (AC-08).
 */
export function restoreRevision(
  target: TimelineDocument,
  current: TimelineDocument,
  newRevisionId: string,
  origin: Omit<Origin, 'restoredFromRevisionId'>,
): TimelineDocument {
  if (target.projectId !== current.projectId) {
    throw new Error('Não é possível restaurar revisão de outro projeto');
  }
  const restored = structuredClone(target);
  restored.revisionId = newRevisionId;
  restored.parentRevisionId = current.revisionId;
  restored.origin = { ...origin, restoredFromRevisionId: target.revisionId };
  return restored;
}

export type { TimelineOperation };
