/**
 * Operações de domínio sobre a timeline (§8). São o único caminho de
 * alteração exposto à interface e ao agente — nunca escrita arbitrária no
 * documento ou no banco.
 */
import { z } from 'zod';
import {
  audioSchema,
  captionWordSchema,
  LYRIC_SOURCES,
  LYRIC_STATUSES,
  patchShape,
  itemSchema,
  textStyleSchema,
  timelineRate,
  transformSchema,
  type TimelineDocument,
  type TimelineItem,
  type Track,
} from './schema.js';
import { clipTimelineDuration } from './time.js';

const id = z.string().min(1).max(128);
const nonNegInt = z.number().int().nonnegative();

export const operationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('insertClip'),
    trackId: id,
    /** Item completo (clip, texto, legenda ou composição). */
    item: itemSchema,
  }),
  z.object({
    op: z.literal('trimClip'),
    itemId: id,
    sourceIn: nonNegInt.optional(),
    sourceOut: z.number().int().positive().optional(),
    /** Para itens sem fonte (texto/legenda/composição/imagem): nova duração. */
    duration: z.number().int().positive().optional(),
    timelineStart: nonNegInt.optional(),
  }),
  z.object({
    op: z.literal('moveClip'),
    itemId: id,
    timelineStart: nonNegInt,
    trackId: id.optional(),
  }),
  z.object({ op: z.literal('removeClip'), itemId: id }),
  z.object({
    op: z.literal('splitClip'),
    itemId: id,
    /** Frame da timeline onde cortar, estritamente dentro do item. */
    atFrame: z.number().int().positive(),
    newItemId: id,
  }),
  z.object({
    op: z.literal('updateText'),
    itemId: id,
    text: z.string().max(2000).optional(),
    style: patchShape(textStyleSchema).optional(),
  }),
  z.object({
    op: z.literal('updateTransform'),
    itemId: id,
    /** Quando presente, altera só o enquadramento desta variante (RF-13). */
    variantId: id.optional(),
    transform: patchShape(transformSchema),
  }),
  z.object({
    op: z.literal('updateAudio'),
    /** Item (clipe) ou trilha inteira. */
    itemId: id.optional(),
    trackId: id.optional(),
    audio: patchShape(audioSchema).optional(),
    muted: z.boolean().optional(),
  }),
  z.object({
    op: z.literal('updateCaptions'),
    /**
     * Correção de texto/estilo de legendas. Nunca corta mídia (RF-06/AC-05):
     * remover trecho do vídeo é outra operação (trim/split/remove).
     */
    edits: z
      .array(z.object({ itemId: id, text: z.string().max(500) }))
      .default([]),
    style: z
      .object({ trackId: id, variantId: id.optional(), style: patchShape(textStyleSchema) })
      .optional(),
  }),
  z.object({
    op: z.literal('setLock'),
    itemId: id.optional(),
    trackId: id.optional(),
    locked: z.boolean(),
  }),
  z.object({
    op: z.literal('setLyricLine'),
    /**
     * Texto e tempos de uma linha de letra numa trilha 'lyrics', de uma vez.
     * Palavras em frames absolutos da timeline; lista vazia = modo linha.
     * Nunca marca VALIDATED (isso é validateLyrics, só para pessoas).
     */
    itemId: id,
    text: z.string().max(500).optional(),
    timelineStart: nonNegInt.optional(),
    duration: z.number().int().positive().optional(),
    words: z.array(captionWordSchema).max(200).optional(),
    status: z.enum(LYRIC_STATUSES).exclude(['VALIDATED']).optional(),
    source: z.enum(LYRIC_SOURCES).optional(),
  }),
  z.object({
    op: z.literal('validateLyrics'),
    /** Validar bloqueia a linha; desvalidar a desbloqueia e volta a SUGGESTED. */
    itemIds: z.array(id).min(1).max(500),
    validated: z.boolean(),
  }),
  z.object({
    op: z.literal('shiftLyrics'),
    /** Deslocamento global (offset) de todas as linhas e palavras da trilha. */
    trackId: id,
    frames: z.number().int(),
  }),
  z.object({
    op: z.literal('updateCompositionParams'),
    itemId: id,
    /** Mescla sobre os parâmetros atuais (`null` remove a chave); o chamador valida contra o template. */
    params: z.record(z.string(), z.unknown()),
  }),
]);

export type TimelineOperation = z.infer<typeof operationSchema>;
export type OperationName = TimelineOperation['op'];

export class OperationError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'LOCKED' | 'INVALID' | 'FORBIDDEN',
    message: string,
    readonly targetId?: string,
  ) {
    super(message);
    this.name = 'OperationError';
  }
}

export type LocateResult = { track: Track; item: TimelineItem; index: number };

export function locateItem(doc: TimelineDocument, itemId: string): LocateResult {
  for (const track of doc.tracks) {
    const index = track.items.findIndex((i) => i.id === itemId);
    if (index >= 0) return { track, item: track.items[index]!, index };
  }
  throw new OperationError('NOT_FOUND', `Item ${itemId} não existe`, itemId);
}

export function findTrack(doc: TimelineDocument, trackId: string): Track {
  const track = doc.tracks.find((t) => t.id === trackId);
  if (!track) throw new OperationError('NOT_FOUND', `Trilha ${trackId} não existe`, trackId);
  return track;
}

/** IDs de itens/trilhas que uma operação modifica — usados na checagem de bloqueio. */
export function operationTargets(doc: TimelineDocument, op: TimelineOperation): string[] {
  switch (op.op) {
    case 'insertClip':
      return [op.trackId];
    case 'moveClip':
      return op.trackId ? [op.itemId, op.trackId] : [op.itemId];
    case 'updateAudio':
      return [op.itemId, op.trackId].filter((v): v is string => Boolean(v));
    case 'updateCaptions':
      return [...op.edits.map((e) => e.itemId), ...(op.style ? [op.style.trackId] : [])];
    case 'setLock':
      return [op.itemId, op.trackId].filter((v): v is string => Boolean(v));
    case 'validateLyrics':
      return op.itemIds;
    case 'shiftLyrics': {
      // Deslocar a trilha mexe em todas as linhas: uma validada (bloqueada) impede.
      const track = doc.tracks.find((t) => t.id === op.trackId);
      return [op.trackId, ...(track?.items.map((i) => i.id) ?? [])];
    }
    default:
      return [op.itemId];
  }
}

/** Verdadeiro se o alvo (item ou trilha) está bloqueado, direta ou pela trilha. */
export function isLocked(doc: TimelineDocument, targetId: string): boolean {
  for (const track of doc.tracks) {
    if (track.id === targetId) return track.locked;
    const item = track.items.find((i) => i.id === targetId);
    if (item) return track.locked || item.locked;
  }
  return false;
}

function recomputeClipDuration(doc: TimelineDocument, item: TimelineItem): void {
  if (item.kind !== 'clip') return;
  const asset = doc.assets[item.assetId];
  if (!asset || asset.kind === 'image') return;
  item.duration = clipTimelineDuration(
    item.sourceIn,
    item.sourceOut,
    asset.sourceTimebase,
    timelineRate(doc),
    item.playbackRate,
  );
}

/**
 * Aplica uma operação a um rascunho mutável. O chamador (patch.ts) trabalha
 * sobre uma cópia e só confirma após validar o resultado inteiro.
 */
export function applyOperation(draft: TimelineDocument, op: TimelineOperation): void {
  switch (op.op) {
    case 'insertClip': {
      const track = findTrack(draft, op.trackId);
      track.items.push(structuredClone(op.item));
      if (op.item.kind === 'clip') recomputeClipDuration(draft, track.items[track.items.length - 1]!);
      return;
    }
    case 'trimClip': {
      const { item } = locateItem(draft, op.itemId);
      if (op.timelineStart !== undefined) item.timelineStart = op.timelineStart;
      const asset = item.kind === 'clip' ? draft.assets[item.assetId] : undefined;
      if (item.kind === 'clip' && asset && asset.kind !== 'image') {
        if (op.duration !== undefined) {
          throw new OperationError('INVALID', 'Clipes com fonte são aparados por sourceIn/sourceOut', item.id);
        }
        if (op.sourceIn !== undefined) item.sourceIn = op.sourceIn;
        if (op.sourceOut !== undefined) item.sourceOut = op.sourceOut;
        recomputeClipDuration(draft, item);
      } else {
        if (op.sourceIn !== undefined || op.sourceOut !== undefined) {
          throw new OperationError('INVALID', 'Item sem fonte temporal: use duration', item.id);
        }
        if (op.duration !== undefined) item.duration = op.duration;
      }
      return;
    }
    case 'moveClip': {
      const located = locateItem(draft, op.itemId);
      // Palavras de legenda estão em frames absolutos: acompanham o item.
      if (located.item.kind === 'caption') shiftWords(located.item, op.timelineStart - located.item.timelineStart);
      located.item.timelineStart = op.timelineStart;
      if (op.trackId && op.trackId !== located.track.id) {
        const target = findTrack(draft, op.trackId);
        located.track.items.splice(located.index, 1);
        target.items.push(located.item);
      }
      return;
    }
    case 'removeClip': {
      const located = locateItem(draft, op.itemId);
      located.track.items.splice(located.index, 1);
      for (const variant of draft.variants) {
        delete variant.transforms[op.itemId];
        delete variant.textStyles[op.itemId];
      }
      return;
    }
    case 'splitClip': {
      const located = locateItem(draft, op.itemId);
      const { item } = located;
      const offset = op.atFrame - item.timelineStart;
      if (offset <= 0 || offset >= item.duration) {
        throw new OperationError('INVALID', `Frame ${op.atFrame} fora do item ${item.id}`, item.id);
      }
      const right = structuredClone(item);
      right.id = op.newItemId;
      right.timelineStart = op.atFrame;
      if (item.kind === 'clip' && right.kind === 'clip') {
        const asset = draft.assets[item.assetId];
        if (asset && asset.kind !== 'image') {
          // Ponto de corte na fonte: converte o deslocamento da timeline de volta.
          const fps = timelineRate(draft);
          const effective = {
            num: asset.sourceTimebase.num * item.playbackRate.num,
            den: asset.sourceTimebase.den * item.playbackRate.den,
          };
          const sourceOffset = Math.round(
            (offset * fps.den * effective.num) / (fps.num * effective.den),
          );
          const cut = item.sourceIn + sourceOffset;
          if (cut <= item.sourceIn || cut >= item.sourceOut) {
            throw new OperationError('INVALID', `Corte não cabe na fonte de ${item.id}`, item.id);
          }
          item.sourceOut = cut;
          right.sourceIn = cut;
          recomputeClipDuration(draft, item);
          recomputeClipDuration(draft, right);
          // Garante continuidade exata na timeline apesar de arredondamentos.
          right.timelineStart = item.timelineStart + item.duration;
        } else {
          item.duration = offset;
          right.duration -= offset;
        }
        item.audio.fadeOutFrames = 0;
        right.audio.fadeInFrames = 0;
      } else {
        item.duration = offset;
        right.duration -= offset;
        if (right.kind === 'caption' && item.kind === 'caption') {
          item.words = item.words.filter((w) => w.end <= op.atFrame);
          right.words = right.words.filter((w) => w.start >= op.atFrame);
        }
      }
      located.track.items.splice(located.index + 1, 0, right);
      for (const variant of draft.variants) {
        const t = variant.transforms[item.id];
        if (t) variant.transforms[right.id] = structuredClone(t);
        const s = variant.textStyles[item.id];
        if (s) variant.textStyles[right.id] = structuredClone(s);
      }
      return;
    }
    case 'updateText': {
      const { item } = locateItem(draft, op.itemId);
      if (item.kind !== 'text') {
        throw new OperationError('INVALID', `${item.id} não é um texto (legendas usam updateCaptions)`, item.id);
      }
      if (op.text !== undefined) item.text = op.text;
      if (op.style) Object.assign(item.style, op.style);
      return;
    }
    case 'updateTransform': {
      const { item } = locateItem(draft, op.itemId);
      if (item.kind === 'caption') {
        throw new OperationError('INVALID', 'Legendas são posicionadas pelo estilo da trilha', item.id);
      }
      if (op.variantId) {
        const variant = draft.variants.find((v) => v.id === op.variantId);
        if (!variant) throw new OperationError('NOT_FOUND', `Variante ${op.variantId} não existe`, op.variantId);
        const base = variant.transforms[item.id] ?? structuredClone(item.transform);
        variant.transforms[item.id] = { ...base, ...op.transform };
      } else {
        Object.assign(item.transform, op.transform);
      }
      return;
    }
    case 'updateAudio': {
      if (!op.itemId && !op.trackId) throw new OperationError('INVALID', 'updateAudio exige itemId ou trackId');
      if (op.trackId) {
        const track = findTrack(draft, op.trackId);
        if (op.muted !== undefined) track.muted = op.muted;
        if (op.audio) {
          for (const item of track.items) if (item.kind === 'clip') Object.assign(item.audio, op.audio);
        }
      }
      if (op.itemId) {
        const { item } = locateItem(draft, op.itemId);
        if (item.kind !== 'clip') throw new OperationError('INVALID', `${item.id} não tem áudio`, item.id);
        if (op.audio) Object.assign(item.audio, op.audio);
      }
      return;
    }
    case 'updateCaptions': {
      for (const edit of op.edits) {
        const { item } = locateItem(draft, edit.itemId);
        if (item.kind !== 'caption') throw new OperationError('INVALID', `${item.id} não é legenda`, item.id);
        item.text = edit.text;
        // Palavras com timing ficam obsoletas se o texto mudou de forma; o
        // alinhamento por palavra é refeito em etapa própria (P3).
        if (item.words.map((w) => w.text).join(' ') !== edit.text) item.words = [];
      }
      if (op.style) {
        const track = findTrack(draft, op.style.trackId);
        if (track.type !== 'caption') throw new OperationError('INVALID', `${track.id} não é trilha de legenda`);
        const variant = op.style.variantId ? draft.variants.find((v) => v.id === op.style!.variantId) : undefined;
        if (op.style.variantId && !variant) {
          throw new OperationError('NOT_FOUND', `Variante ${op.style.variantId} não existe`, op.style.variantId);
        }
        // Estilo de legenda vive por item; aplicamos a todos da trilha.
        for (const item of track.items) {
          if (variant) {
            variant.textStyles[item.id] = { ...(variant.textStyles[item.id] ?? {}), ...op.style.style };
          } else {
            const base = captionBaseStyles(draft);
            base[item.id] = { ...(base[item.id] ?? {}), ...op.style.style };
          }
        }
      }
      return;
    }
    case 'setLock': {
      if (op.trackId) findTrack(draft, op.trackId).locked = op.locked;
      if (op.itemId) locateItem(draft, op.itemId).item.locked = op.locked;
      return;
    }
    case 'setLyricLine': {
      const item = lyricItem(draft, op.itemId);
      if (op.text !== undefined) item.text = op.text;
      if (op.timelineStart !== undefined) item.timelineStart = op.timelineStart;
      if (op.duration !== undefined) item.duration = op.duration;
      if (op.words !== undefined) {
        for (let i = 1; i < op.words.length; i += 1) {
          if (op.words[i]!.start < op.words[i - 1]!.start) {
            throw new OperationError('INVALID', `Palavras fora de ordem na linha ${item.id}`, item.id);
          }
        }
        item.words = structuredClone(op.words);
      } else if (op.text !== undefined && item.words.map((w) => w.text).join(' ') !== op.text.replace(/\s+/g, ' ').trim()) {
        // Texto mudou e as palavras não foram reenviadas: os tempos antigos não valem mais.
        item.words = [];
      }
      const lyric = item.lyric!;
      if (op.source !== undefined) lyric.source = op.source;
      if (op.status !== undefined) lyric.status = op.status;
      else if (op.timelineStart !== undefined || op.duration !== undefined || op.words !== undefined) {
        // Ajuste humano de tempo deixa a linha sincronizada, mas ainda não validada.
        if (lyric.status === 'UNALIGNED' || lyric.status === 'LOW_CONFIDENCE') lyric.status = 'SUGGESTED';
      }
      return;
    }
    case 'validateLyrics': {
      for (const itemId of op.itemIds) {
        const item = lyricItem(draft, itemId);
        if (op.validated && item.lyric!.status === 'UNALIGNED') {
          throw new OperationError('INVALID', `A linha "${item.text}" ainda não tem tempo; sincronize antes de validar.`, item.id);
        }
        item.lyric!.status = op.validated ? 'VALIDATED' : 'SUGGESTED';
        item.locked = op.validated;
      }
      return;
    }
    case 'shiftLyrics': {
      const track = findTrack(draft, op.trackId);
      if (track.role !== 'lyrics') throw new OperationError('INVALID', `${track.id} não é trilha de letra`, track.id);
      for (const item of track.items) {
        if (item.kind !== 'caption') continue;
        if (item.timelineStart + op.frames < 0) {
          throw new OperationError('INVALID', `O deslocamento levaria "${item.text}" para antes do início`, item.id);
        }
        item.timelineStart += op.frames;
        shiftWords(item, op.frames);
      }
      return;
    }
    case 'updateCompositionParams': {
      const { item } = locateItem(draft, op.itemId);
      if (item.kind !== 'composition') throw new OperationError('INVALID', `${item.id} não é composição`, item.id);
      const next: Record<string, unknown> = { ...item.params };
      // `null` remove a chave (ex.: o `$file:` de uma cena retirada).
      for (const [key, value] of Object.entries(structuredClone(op.params))) {
        if (value === null) delete next[key];
        else next[key] = value;
      }
      item.params = next;
      return;
    }
  }
}

function shiftWords(item: Extract<TimelineItem, { kind: 'caption' }>, delta: number): void {
  if (delta === 0) return;
  for (const w of item.words) {
    w.start += delta;
    w.end += delta;
  }
}

function lyricItem(draft: TimelineDocument, itemId: string): Extract<TimelineItem, { kind: 'caption' }> {
  const { track, item } = locateItem(draft, itemId);
  if (track.role !== 'lyrics' || item.kind !== 'caption' || !item.lyric) {
    throw new OperationError('INVALID', `${itemId} não é uma linha de letra`, itemId);
  }
  return item;
}

/**
 * Estilos base das legendas (fora de variantes) ficam numa variante
 * implícita "base" para não duplicar estilo em cada item de legenda.
 */
export const BASE_VARIANT_ID = 'base';

function captionBaseStyles(draft: TimelineDocument) {
  let base = draft.variants.find((v) => v.id === BASE_VARIANT_ID);
  if (!base) {
    base = {
      id: BASE_VARIANT_ID,
      label: 'Principal',
      width: draft.video.width,
      height: draft.video.height,
      transforms: {},
      textStyles: {},
    };
    draft.variants.unshift(base);
  }
  return base.textStyles;
}
