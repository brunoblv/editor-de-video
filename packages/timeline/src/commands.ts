/**
 * Comandos editoriais compostos, que só GERAM operações de domínio. Assim a
 * interface e o agente usam o mesmo vocabulário e todo efeito passa pela
 * validação do patch. Ex.: "Remover trecho do vídeo" (distinto de corrigir
 * texto de legenda — RF-06).
 */
import type { TimelineOperation } from './operations.js';
import { isLocked } from './operations.js';
import type { TimelineDocument, TimelineItem } from './schema.js';
import { itemEnd } from './validate.js';

export type IdFactory = (prefix: string) => string;

let counter = 0;
export const defaultIdFactory: IdFactory = (prefix) =>
  `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

/**
 * Remove o intervalo [start, end) da timeline em todas as trilhas não
 * bloqueadas e puxa o restante para trás (ripple). Trilhas bloqueadas que
 * cruzem o intervalo fazem o comando falhar, para não dessincronizar.
 */
export function removeRangeOps(
  doc: TimelineDocument,
  start: number,
  end: number,
  newId: IdFactory = defaultIdFactory,
): TimelineOperation[] {
  if (end <= start) throw new Error('Intervalo vazio');
  const length = end - start;
  const ops: TimelineOperation[] = [];

  for (const track of doc.tracks) {
    const affected = track.items.filter((i) => itemEnd(i) > start);
    if (affected.length === 0) continue;
    // Itens bloqueados depois do trecho também precisariam ser deslocados.
    if (track.locked || affected.some((i) => isLocked(doc, i.id))) {
      throw new Error(`Trilha ${track.id} tem elementos bloqueados no trecho; desbloqueie ou escolha outro intervalo.`);
    }
    // Processa da direita para a esquerda para que os moves não colidam.
    const ordered = [...affected].sort((a, b) => b.timelineStart - a.timelineStart);
    for (const item of ordered) {
      const iStart = item.timelineStart;
      const iEnd = itemEnd(item);
      if (iStart >= end) {
        ops.push({ op: 'moveClip', itemId: item.id, timelineStart: iStart - length });
      } else if (iStart >= start && iEnd <= end) {
        ops.push({ op: 'removeClip', itemId: item.id });
      } else if (iStart < start && iEnd > end) {
        // Atravessa o trecho: divide no fim, remove o miolo pela esquerda.
        const rightId = newId(item.id);
        ops.push({ op: 'splitClip', itemId: item.id, atFrame: end, newItemId: rightId });
        ops.push(...trimEndOps(item, start));
        ops.push({ op: 'moveClip', itemId: rightId, timelineStart: start });
      } else if (iStart < start) {
        ops.push(...trimEndOps(item, start));
      } else {
        // Começa dentro do trecho e termina depois: apara o início.
        const rightId = newId(item.id);
        ops.push({ op: 'splitClip', itemId: item.id, atFrame: end, newItemId: rightId });
        ops.push({ op: 'removeClip', itemId: item.id });
        ops.push({ op: 'moveClip', itemId: rightId, timelineStart: start });
      }
    }
  }
  return ops;
}

/** Encurta o fim de um item para terminar em `newEnd` (split + remove da sobra). */
function trimEndOps(item: TimelineItem, newEnd: number): TimelineOperation[] {
  const tailId = `${item.id}-tail-${newEnd}`;
  return [
    { op: 'splitClip', itemId: item.id, atFrame: newEnd, newItemId: tailId },
    { op: 'removeClip', itemId: tailId },
  ];
}

/**
 * "Encurte a abertura para N segundos": remove o excesso do primeiro bloco
 * do vídeo principal (a partir do frame `targetFrames`).
 */
export function shortenOpeningOps(
  doc: TimelineDocument,
  openingEndFrame: number,
  targetFrames: number,
  newId?: IdFactory,
): TimelineOperation[] {
  if (targetFrames >= openingEndFrame) return [];
  return removeRangeOps(doc, targetFrames, openingEndFrame, newId);
}
