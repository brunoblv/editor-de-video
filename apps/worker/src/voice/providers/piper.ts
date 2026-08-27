import { config } from '@editor-video/core';
import { resolveModel, runPiperSegment } from '../../v2/tts.js';
import type { VoiceSegment } from '../types.js';

/** Sintetiza um único segmento com Piper, aplicando o multiplicador de ritmo do segmento. */
export async function synthesizeSegmentWithPiper(segment: VoiceSegment, outputWav: string): Promise<void> {
  const model = await resolveModel();
  await runPiperSegment(segment.text, model, outputWav, {
    lengthScale: config.piper.lengthScale * segment.lengthScale,
    sentenceSilence: config.piper.sentenceSilence,
  });
}
