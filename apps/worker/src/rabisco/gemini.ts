import { config } from '@editor-video/core';
import type { RabiscoAction, RabiscoAnimation, RabiscoEmotion, RabiscoPosition } from '@editor-video/core';
import { RABISCO_ACTIONS, RABISCO_EXPRESSIONS } from '@editor-video/core';
import { buildContentPrompt, contentResponseSchema } from './prompts/content.js';

export type GeneratedCharacterScene = {
  startSec: number;
  endSec: number;
  emotion: RabiscoEmotion;
  action: RabiscoAction;
  position: RabiscoPosition;
  animation: RabiscoAnimation;
  thought?: string;
};

export type GeneratedReflection = {
  title: string;
  hook: string;
  narration: string;
  durationTargetSec: number;
  characterScenes: GeneratedCharacterScene[];
};

interface GeminiCandidatePart {
  text?: string;
}
interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiCandidatePart[] } }>;
}

const VALID_EMOTIONS = new Set(Object.keys(RABISCO_EXPRESSIONS));
const VALID_ACTIONS = new Set(Object.keys(RABISCO_ACTIONS));
const VALID_POSITIONS = new Set(['center', 'left', 'right', 'bottom']);
const VALID_ANIMATIONS = new Set(['fade', 'slide-left', 'slide-right', 'rise', 'float', 'zoom']);

function normalizeScene(raw: unknown, index: number): GeneratedCharacterScene | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const emotion = typeof obj.emotion === 'string' && VALID_EMOTIONS.has(obj.emotion) ? (obj.emotion as RabiscoEmotion) : null;
  const action = typeof obj.action === 'string' && VALID_ACTIONS.has(obj.action) ? (obj.action as RabiscoAction) : null;
  const position =
    typeof obj.position === 'string' && VALID_POSITIONS.has(obj.position) ? (obj.position as RabiscoPosition) : 'center';
  const animation =
    typeof obj.animation === 'string' && VALID_ANIMATIONS.has(obj.animation)
      ? (obj.animation as RabiscoAnimation)
      : 'fade';

  if (!emotion || !action) return null;

  const startSec = Number.isFinite(Number(obj.startSec)) ? Number(obj.startSec) : index;
  const endSec = Number.isFinite(Number(obj.endSec)) ? Number(obj.endSec) : startSec + 1;
  const thought = typeof obj.thought === 'string' && obj.thought.trim() ? obj.thought.trim() : undefined;

  return { startSec, endSec: Math.max(endSec, startSec + 0.1), emotion, action, position, animation, thought };
}

function normalize(raw: unknown, thought: string): GeneratedReflection {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Gemini não retornou um objeto JSON válido para a reflexão.');
  }
  const obj = raw as Record<string, unknown>;

  const narration = typeof obj.narration === 'string' ? obj.narration.trim() : '';
  if (!narration) {
    throw new Error('Reflexão gerada sem narração — tente novamente.');
  }

  const rawScenes = Array.isArray(obj.characterScenes) ? obj.characterScenes : [];
  const characterScenes = rawScenes
    .map((scene, index) => normalizeScene(scene, index))
    .filter((scene): scene is GeneratedCharacterScene => scene !== null);

  if (characterScenes.length === 0) {
    throw new Error('Gemini não retornou nenhuma cena de personagem válida.');
  }

  return {
    title: typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : thought.slice(0, 60),
    hook: typeof obj.hook === 'string' ? obj.hook.trim() : '',
    narration,
    durationTargetSec: Number.isFinite(Number(obj.durationTargetSec))
      ? Number(obj.durationTargetSec)
      : config.rabisco.minDurationSec,
    characterScenes,
  };
}

/** Gera roteiro + direção de cena via Gemini (Structured Outputs), nunca texto livre. */
export async function generateReflection(opts: { thought: string }): Promise<GeneratedReflection> {
  const apiKey = config.rabisco.geminiApiKey;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY (ou RABISCO_GEMINI_API_KEY) não configurado no .env.');
  }

  const { system, user } = buildContentPrompt({
    thought: opts.thought,
    minDurationSec: config.rabisco.minDurationSec,
    maxDurationSec: config.rabisco.maxDurationSec,
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.rabisco.geminiModel}:generateContent?key=${apiKey}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: contentResponseSchema(),
          temperature: 0.9,
        },
      }),
    });
  } catch (err) {
    throw new Error(
      `Não foi possível conectar ao Gemini. (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(`Gemini respondeu ${response.status}: ${bodyText.slice(0, 300)}`);
  }

  const payload = (await response.json()) as GeminiResponse;
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  if (!text.trim()) {
    throw new Error('Gemini retornou uma resposta vazia.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gemini não retornou JSON válido apesar do schema estruturado.');
  }

  return normalize(parsed, opts.thought);
}
