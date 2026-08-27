/**
 * Voice Director (docs/Cristão/projeto.md §17/§18) — tipos compartilhados.
 * Vive em apps/worker porque os providers (Piper via child_process, Gemini TTS
 * via fetch server-side) são conceitos exclusivos do worker; packages/core é
 * importado pelo Remotion (browser bundle) e precisa ficar livre de Node.
 */

export type Emotion = 'neutral' | 'calm' | 'warm' | 'hopeful' | 'reverent' | 'firm' | 'somber';

export interface VoiceContext {
  pillarId: string;
  category: string;
  voiceMoodHint: Emotion | null;
}

export interface ContentScript {
  script: string;
  reflection: string;
  cta: string;
}

export type SegmentSource = 'script' | 'reflection' | 'cta';

export interface VoiceSegment {
  text: string;
  emotion: Emotion;
  /** Multiplicador sobre config.piper.lengthScale — usado pelo fallback Piper. */
  lengthScale: number;
  /** Direção em linguagem natural — usada pelo Gemini TTS. */
  styleInstruction: string;
  /** 0-1, apenas informativo por enquanto (sem consumidor de DSP ainda). */
  intensity: number;
  /** Silêncio (ms) inserido depois deste segmento/grupo. */
  pauseAfterMs: number;
  source: SegmentSource;
}

export interface DirectedScript {
  segments: VoiceSegment[];
  /** Categoria do pilar usada para escolher o perfil — útil para QA/debug. */
  profileUsed: string;
}
