import { config } from '@editor-video/core';
import type { Pillar } from './pillars.js';
import { buildContentPrompt, contentResponseSchema } from './prompts/content.js';
import { buildModelChain, withGeminiModelFallback } from '../gemini-fallback.js';

export type GeneratedContent = {
  contentType: string;
  theme: string;
  title: string;
  hook: string;
  script: string;
  reflection: string;
  cta: string;
  description: string;
  hashtags: string[];
  youtubeTitle: string;
  youtubeDescription: string;
  youtubeHashtags: string[];
  visualPrompt: string;
  visualMood: string;
  voiceMood: string;
  durationTarget: number;
  safetyNotes: string[];
};

interface GeminiCandidatePart {
  text?: string;
}
interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiCandidatePart[] } }>;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalize(raw: unknown, pillar: Pillar): GeneratedContent {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Gemini não retornou um objeto JSON válido para o conteúdo.');
  }
  const obj = raw as Record<string, unknown>;

  const script = typeof obj.script === 'string' ? obj.script.trim() : '';
  const reflection = typeof obj.reflection === 'string' ? obj.reflection.trim() : '';
  if (!script && !reflection) {
    throw new Error('Conteúdo gerado sem roteiro nem reflexão — tente novamente.');
  }

  return {
    contentType: typeof obj.contentType === 'string' ? obj.contentType : pillar.id,
    theme: typeof obj.theme === 'string' ? obj.theme : pillar.category,
    title: typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : pillar.label,
    hook: typeof obj.hook === 'string' ? obj.hook.trim() : '',
    script,
    reflection,
    cta: typeof obj.cta === 'string' ? obj.cta.trim() : '',
    description: typeof obj.description === 'string' ? obj.description.trim() : '',
    hashtags: asStringArray(obj.hashtags),
    youtubeTitle:
      typeof obj.youtubeTitle === 'string' && obj.youtubeTitle.trim()
        ? obj.youtubeTitle.trim()
        : typeof obj.title === 'string'
          ? obj.title.trim()
          : pillar.label,
    youtubeDescription:
      typeof obj.youtubeDescription === 'string' && obj.youtubeDescription.trim()
        ? obj.youtubeDescription.trim()
        : typeof obj.description === 'string'
          ? obj.description.trim()
          : '',
    youtubeHashtags: asStringArray(obj.youtubeHashtags),
    visualPrompt:
      typeof obj.visualPrompt === 'string' && obj.visualPrompt.trim()
        ? obj.visualPrompt.trim()
        : `${pillar.category} cinematic emotional b-roll`,
    visualMood: typeof obj.visualMood === 'string' ? obj.visualMood : 'calm',
    voiceMood: typeof obj.voiceMood === 'string' ? obj.voiceMood : 'calm',
    durationTarget: Number.isFinite(Number(obj.durationTarget))
      ? Number(obj.durationTarget)
      : config.christian.minDurationSec,
    safetyNotes: asStringArray(obj.safetyNotes),
  };
}

async function callGemini(model: string, system: string, user: string): Promise<unknown> {
  const apiKey = config.christian.geminiApiKey;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurado no .env.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Gemini não retornou JSON válido apesar do schema estruturado.');
  }
}

/** Gera o conteúdo estruturado via Gemini (Structured Outputs), nunca texto livre. */
export async function generateContent(opts: {
  pillar: Pillar;
  verse: { reference: string; text: string } | null;
}): Promise<GeneratedContent> {
  const { system, user } = buildContentPrompt({
    pillar: opts.pillar,
    verse: opts.verse,
    minDurationSec: config.christian.minDurationSec,
    maxDurationSec: config.christian.maxDurationSec,
  });

  const models = buildModelChain(config.christian.geminiModel, config.christian.geminiModelFallbacks);
  const parsed = await withGeminiModelFallback(models, (model) => callGemini(model, system, user));
  return normalize(parsed, opts.pillar);
}
