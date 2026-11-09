/**
 * Dados da composição `reactive-lyrics` a partir do plano compilado: letra
 * (frames da revisão) + valores reativos do mapa musical no trecho exato da
 * música que a camada cobre. Prévia de trecho e final usam esta mesma função.
 */
import { buildLyricsCompositionData, type LyricsCompositionData, type MusicalMap } from '@editor-video/domain';
import type { PlannedVideoLayer, RenderPlan } from '@editor-video/timeline/compile';

export const LYRICS_TEMPLATE_SLUG = 'reactive-lyrics';

/**
 * Instante da música (ms) no início da camada: o áudio do plano diz qual
 * trecho da fonte toca em cada segundo do plano.
 */
export function songStartMsForLayer(plan: RenderPlan, layer: PlannedVideoLayer, audioAssetId: string): number {
  const audio = plan.audio.find((a) => a.assetId === audioAssetId && a.startSec <= layer.startSec + 1e-9 && a.endSec > layer.startSec);
  if (!audio) throw Object.assign(new Error('A música não toca no início da composição de letra.'), { category: 'INVALID' });
  return (audio.sourceInSec + (layer.startSec - audio.startSec) * audio.speed) * 1000;
}

export function lyricsDataForLayer(plan: RenderPlan, layer: PlannedVideoLayer, map: MusicalMap, audioAssetId: string, variables: Record<string, unknown>): LyricsCompositionData {
  const fps = plan.fps;
  const layerStartFrame = Math.round((layer.startSec * fps.num) / fps.den);
  const frameCount = Math.round(((layer.endSec - layer.startSec) * fps.num) / fps.den);
  return buildLyricsCompositionData({
    map,
    fps,
    frameCount,
    songStartMs: songStartMsForLayer(plan, layer, audioAssetId),
    lines: plan.lyrics.map((l) => ({
      itemId: l.itemId,
      text: l.text,
      startFrame: l.startFrame - layerStartFrame,
      endFrame: l.endFrame - layerStartFrame,
      words: l.words ? l.words.map((w) => ({ text: w.text, startFrame: w.startFrame - layerStartFrame, endFrame: w.endFrame - layerStartFrame })) : null,
    })),
    params: variables,
  });
}
