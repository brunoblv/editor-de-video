import type { Emotion } from './types.js';

export interface DirectionProfile {
  emotion: Emotion;
  /** Multiplicador sobre config.piper.lengthScale. */
  lengthScale: number;
  /** Prefixo de estilo em PT-BR enviado ao Gemini TTS. */
  styleInstruction: string;
  intensity: number;
  pauseMs: { sentence: number; paragraph: number };
}

/**
 * Direção por categoria de pilar (docs/Cristão/projeto.md §6). Determinístico —
 * a categoria já é conhecida antes do TTS rodar, então isso é uma tabela de
 * consulta, não uma decisão criativa que exigiria mais uma chamada ao Gemini.
 * Categorias reais vêm de packages/core/src/christian.ts (PILLARS[].category).
 */
export const CATEGORY_PROFILES: Record<string, DirectionProfile> = {
  fe: { emotion: 'reverent', lengthScale: 1.0, styleInstruction: 'Fale com um tom reverente, calmo e íntimo, como alguém compartilhando algo sagrado em voz baixa', intensity: 0.4, pauseMs: { sentence: 450, paragraph: 900 } },
  oracao: { emotion: 'reverent', lengthScale: 1.05, styleInstruction: 'Fale devagar e suavemente, como alguém conduzindo uma oração pessoal, com pausas respeitosas', intensity: 0.3, pauseMs: { sentence: 550, paragraph: 1100 } },
  forca: { emotion: 'firm', lengthScale: 0.95, styleInstruction: 'Fale com firmeza e encorajamento, com energia contida, sem soar como propaganda', intensity: 0.6, pauseMs: { sentence: 400, paragraph: 800 } },
  esperanca: { emotion: 'hopeful', lengthScale: 0.97, styleInstruction: 'Fale com esperança genuína e calor humano, como quem consola um amigo', intensity: 0.5, pauseMs: { sentence: 400, paragraph: 800 } },
  geral: { emotion: 'warm', lengthScale: 1.0, styleInstruction: 'Fale de forma natural, próxima e acolhedora, como numa conversa', intensity: 0.4, pauseMs: { sentence: 400, paragraph: 800 } },
  descanso: { emotion: 'calm', lengthScale: 1.1, styleInstruction: 'Fale muito devagar, num tom calmo e reconfortante, quase como embalando para dormir', intensity: 0.2, pauseMs: { sentence: 600, paragraph: 1200 } },
  recomeco: { emotion: 'hopeful', lengthScale: 0.98, styleInstruction: 'Fale com esperança serena, como quem abre uma nova possibilidade', intensity: 0.5, pauseMs: { sentence: 400, paragraph: 800 } },
  ansiedade: { emotion: 'calm', lengthScale: 1.08, styleInstruction: 'Fale devagar e com calma, num tom tranquilizador, sem pressa', intensity: 0.3, pauseMs: { sentence: 500, paragraph: 1000 } },
  medo: { emotion: 'calm', lengthScale: 1.08, styleInstruction: 'Fale com calma e segurança, tranquilizando sem minimizar o sentimento', intensity: 0.3, pauseMs: { sentence: 500, paragraph: 1000 } },
  solidao: { emotion: 'somber', lengthScale: 1.08, styleInstruction: 'Fale com empatia suave, num tom próximo e um pouco contido', intensity: 0.3, pauseMs: { sentence: 500, paragraph: 1000 } },
  perdao: { emotion: 'warm', lengthScale: 1.02, styleInstruction: 'Fale com calor e compreensão, sem julgamento no tom', intensity: 0.4, pauseMs: { sentence: 450, paragraph: 900 } },
  proposito: { emotion: 'hopeful', lengthScale: 0.97, styleInstruction: 'Fale com esperança clara e confiante, sem exagero', intensity: 0.5, pauseMs: { sentence: 400, paragraph: 800 } },
  paciencia: { emotion: 'calm', lengthScale: 1.08, styleInstruction: 'Fale devagar e serenamente, com pausas naturais', intensity: 0.3, pauseMs: { sentence: 500, paragraph: 1000 } },
  gratidao: { emotion: 'warm', lengthScale: 1.0, styleInstruction: 'Fale com calor genuíno e leveza, como quem agradece de coração', intensity: 0.4, pauseMs: { sentence: 450, paragraph: 900 } },
  familia: { emotion: 'warm', lengthScale: 1.0, styleInstruction: 'Fale com carinho e proximidade, tom caseiro e acolhedor', intensity: 0.4, pauseMs: { sentence: 400, paragraph: 800 } },
  relacionamentos: { emotion: 'warm', lengthScale: 1.0, styleInstruction: 'Fale com empatia e calor, num tom de conversa entre amigos', intensity: 0.4, pauseMs: { sentence: 400, paragraph: 800 } },
  trabalho: { emotion: 'firm', lengthScale: 0.97, styleInstruction: 'Fale com firmeza tranquila e confiança, sem soar como coach motivacional', intensity: 0.5, pauseMs: { sentence: 400, paragraph: 800 } },
  fracasso: { emotion: 'somber', lengthScale: 1.05, styleInstruction: 'Fale com empatia contida e respeito pela dor, sem dramatizar', intensity: 0.4, pauseMs: { sentence: 450, paragraph: 900 } },
  rejeicao: { emotion: 'somber', lengthScale: 1.05, styleInstruction: 'Fale com empatia contida e respeito pela dor, sem dramatizar', intensity: 0.4, pauseMs: { sentence: 450, paragraph: 900 } },
  luto: { emotion: 'somber', lengthScale: 1.12, styleInstruction: 'Fale muito devagar, em tom baixo e acolhedor, com pausas longas e respeitosas', intensity: 0.2, pauseMs: { sentence: 600, paragraph: 1200 } },
  autoestima: { emotion: 'warm', lengthScale: 1.0, styleInstruction: 'Fale com carinho e firmeza gentil, validando sem soar piegas', intensity: 0.4, pauseMs: { sentence: 400, paragraph: 800 } },
};

export const DEFAULT_PROFILE: DirectionProfile = CATEGORY_PROFILES.geral!;

export function profileForCategory(category: string): DirectionProfile {
  return CATEGORY_PROFILES[category] ?? DEFAULT_PROFILE;
}

/**
 * voiceMood (campo livre do Gemini, ex.: "calm", "warm", "firm", "deep") →
 * Emotion controlada. Retorna null se não mapear — nesse caso o perfil da
 * categoria decide (voiceMood é uma dica, não autoritativo).
 */
const VOICE_MOOD_MAP: Record<string, Emotion> = {
  calm: 'calm',
  warm: 'warm',
  firm: 'firm',
  deep: 'reverent',
  hopeful: 'hopeful',
  gentle: 'calm',
  sad: 'somber',
};

export function mapVoiceMood(voiceMood: string | null | undefined): Emotion | null {
  if (!voiceMood) return null;
  return VOICE_MOOD_MAP[voiceMood.trim().toLowerCase()] ?? null;
}
