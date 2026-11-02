/**
 * Variantes de formato (RF-13 / AC-07): 9:16 e 16:9 compartilham as decisões
 * editoriais (cortes, ordem, textos) e têm enquadramento próprio. Mudar o
 * formato nunca estica o vídeo: o padrão é "fit" e o crop é ajustado por item.
 */
import type { TextStyle, TimelineDocument, TimelineItem, Transform, Variant } from './schema.js';
import { BASE_VARIANT_ID } from './operations.js';

export const ASPECT_PRESETS = {
  '9:16': { width: 1080, height: 1920, label: 'Vertical 9:16' },
  '16:9': { width: 1920, height: 1080, label: 'Horizontal 16:9' },
  '1:1': { width: 1080, height: 1080, label: 'Quadrado 1:1' },
  '4:5': { width: 1080, height: 1350, label: 'Retrato 4:5' },
} as const;

export type AspectPreset = keyof typeof ASPECT_PRESETS;

/**
 * Crop central que preenche o quadro de saída sem distorcer, a partir das
 * dimensões do asset. Ponto de partida editável pelo usuário/agente.
 */
export function centerFillCrop(
  sourceWidth: number,
  sourceHeight: number,
  outWidth: number,
  outHeight: number,
): { x: number; y: number; width: number; height: number } {
  const sourceAspect = sourceWidth / sourceHeight;
  const outAspect = outWidth / outHeight;
  if (sourceAspect > outAspect) {
    const width = outAspect / sourceAspect;
    return { x: (1 - width) / 2, y: 0, width, height: 1 };
  }
  const height = sourceAspect / outAspect;
  return { x: 0, y: (1 - height) / 2, width: 1, height };
}

/**
 * Cria (ou substitui) uma variante. `strategy: 'fill'` gera crops centrais por
 * clipe; `'fit'` mantém o quadro inteiro com barras. Retorna novo documento.
 */
export function addVariant(
  doc: TimelineDocument,
  preset: AspectPreset,
  strategy: 'fit' | 'fill' = 'fill',
  variantId: string = `v-${preset.replace(':', 'x')}`,
): TimelineDocument {
  const next = structuredClone(doc);
  const { width, height, label } = ASPECT_PRESETS[preset];
  const transforms: Record<string, Transform> = {};
  if (strategy === 'fill') {
    for (const track of next.tracks) {
      if (track.type !== 'video') continue;
      for (const item of track.items) {
        if (item.kind !== 'clip') continue;
        const asset = next.assets[item.assetId];
        if (!asset?.width || !asset.height) continue;
        transforms[item.id] = {
          ...item.transform,
          fit: 'fill',
          crop: centerFillCrop(asset.width, asset.height, width, height),
        };
      }
    }
  }
  const variant: Variant = { id: variantId, label, width, height, transforms, textStyles: {} };
  next.variants = [...next.variants.filter((v) => v.id !== variantId), variant];
  return next;
}

export type ResolvedVariant = { id: string; width: number; height: number };

export function resolveVariant(doc: TimelineDocument, variantId?: string | null): ResolvedVariant {
  if (!variantId || variantId === BASE_VARIANT_ID) {
    return { id: BASE_VARIANT_ID, width: doc.video.width, height: doc.video.height };
  }
  const variant = doc.variants.find((v) => v.id === variantId);
  if (!variant) throw new Error(`Variante ${variantId} não existe`);
  return { id: variant.id, width: variant.width, height: variant.height };
}

/** Transformação efetiva de um item numa variante (variante > principal). */
export function effectiveTransform(
  doc: TimelineDocument,
  item: TimelineItem,
  variantId?: string | null,
): Transform | null {
  if (item.kind === 'caption') return null;
  const variant = variantId ? doc.variants.find((v) => v.id === variantId) : undefined;
  return variant?.transforms[item.id] ?? item.transform;
}

/** Estilo efetivo de texto/legenda: item → base → variante. */
export function effectiveTextStyle(
  doc: TimelineDocument,
  item: TimelineItem,
  variantId?: string | null,
): Partial<TextStyle> {
  const base = doc.variants.find((v) => v.id === BASE_VARIANT_ID)?.textStyles[item.id] ?? {};
  const variant =
    variantId && variantId !== BASE_VARIANT_ID
      ? (doc.variants.find((v) => v.id === variantId)?.textStyles[item.id] ?? {})
      : {};
  const own = item.kind === 'text' ? item.style : {};
  return { ...own, ...base, ...variant };
}
