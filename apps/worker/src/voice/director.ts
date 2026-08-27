import { segmentScript } from './segmenter.js';
import { prepareTextForSpeech } from './pronunciation.js';
import type { ContentScript, DirectedScript, VoiceContext } from './types.js';

/**
 * Ponto de entrada do Voice Director: roteiro → segmentos dirigidos por
 * emoção/ritmo/pausa, com texto já preparado para fala (referências bíblicas
 * por extenso etc). Não faz síntese — isso é responsabilidade de synth.ts.
 */
export function directScript(input: ContentScript, ctx: VoiceContext): DirectedScript {
  const directed = segmentScript(input, ctx.category, ctx.voiceMoodHint);
  return {
    ...directed,
    segments: directed.segments.map((segment) => ({
      ...segment,
      text: prepareTextForSpeech(segment.text),
    })),
  };
}
