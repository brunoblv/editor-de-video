import { profileForCategory } from './profiles.js';
import type { ContentScript, DirectedScript, Emotion, SegmentSource, VoiceSegment } from './types.js';

/** Quebra um parágrafo em frases: primeiro por linha (Gemini já escreve linhas
 * curtas), depois por pontuação final para qualquer linha que ainda esteja longa. */
function splitIntoSentences(paragraph: string): string[] {
  const lines = paragraph
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const sentences: string[] = [];
  for (const line of lines) {
    if (line.length <= 140) {
      sentences.push(line);
      continue;
    }
    const parts = line.match(/[^.!?…]+[.!?…]*/g) ?? [line];
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed) sentences.push(trimmed);
    }
  }
  return sentences;
}

function buildSegments(
  text: string,
  source: SegmentSource,
  emotion: Emotion,
  lengthScale: number,
  styleInstruction: string,
  intensity: number,
  sentencePauseMs: number,
  paragraphPauseMs: number,
): VoiceSegment[] {
  const sentences = splitIntoSentences(text);
  return sentences.map((sentence, index) => ({
    text: sentence,
    emotion,
    lengthScale,
    styleInstruction,
    intensity,
    pauseAfterMs: index === sentences.length - 1 ? paragraphPauseMs : sentencePauseMs,
    source,
  }));
}

/**
 * Segmentação determinística por regras (docs/Cristão/projeto.md §9) — não
 * pede ao Gemini para pré-segmentar: a categoria do pilar já é conhecida antes
 * do TTS, então a direção (emoção/ritmo/pausa) é consulta de tabela, não
 * julgamento criativo. Evita uma chamada extra ao LLM e mantém resultado
 * reprodutível.
 */
export function segmentScript(
  input: ContentScript,
  category: string,
  voiceMoodOverride: Emotion | null,
): DirectedScript {
  const profile = profileForCategory(category);
  const emotion = voiceMoodOverride ?? profile.emotion;

  const segments: VoiceSegment[] = [];

  if (input.script.trim()) {
    segments.push(
      ...buildSegments(
        input.script,
        'script',
        emotion,
        profile.lengthScale,
        profile.styleInstruction,
        profile.intensity,
        profile.pauseMs.sentence,
        profile.pauseMs.paragraph,
      ),
    );
  }

  if (input.reflection.trim()) {
    segments.push(
      ...buildSegments(
        input.reflection,
        'reflection',
        emotion,
        profile.lengthScale,
        profile.styleInstruction,
        profile.intensity,
        profile.pauseMs.sentence,
        profile.pauseMs.paragraph,
      ),
    );
  }

  if (input.cta.trim()) {
    segments.push({
      text: input.cta.trim(),
      emotion: 'warm',
      lengthScale: profile.lengthScale,
      styleInstruction: 'Fale com calor e naturalidade, como um convite gentil, sem parecer um anúncio',
      intensity: 0.4,
      pauseAfterMs: 0,
      source: 'cta',
    });
  }

  return { segments, profileUsed: category };
}
