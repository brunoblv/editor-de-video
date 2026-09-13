import fsp from 'node:fs/promises';
import { config } from '@editor-video/core';
import { logger } from './logger.js';
import { buildModelChain, withGeminiModelFallback } from './gemini-fallback.js';
import type { TranscriptResult, TranscriptSegment, TranscriptWord } from './whisper.js';

const log = logger('gemini-captions');

interface GeminiCandidatePart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
}
interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiCandidatePart[] } }>;
}

const CAPTION_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    language: { type: 'string' },
    segments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          startSec: { type: 'number' },
          endSec: { type: 'number' },
          words: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                startSec: { type: 'number' },
                endSec: { type: 'number' },
              },
              required: ['text', 'startSec', 'endSec'],
            },
          },
        },
        required: ['text', 'startSec', 'endSec', 'words'],
      },
    },
  },
  required: ['language', 'segments'],
} as const;

function mimeForAudio(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.m4a') || lower.endsWith('.aac')) return 'audio/aac';
  return 'audio/wav';
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitTextAsWords(text: string, startSec: number, endSec: number): TranscriptWord[] {
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [];
  const span = Math.max(endSec - startSec, 0.05);
  const step = span / parts.length;
  return parts.map((word, index) => ({
    text: word,
    startSec: startSec + step * index,
    endSec: startSec + step * (index + 1),
  }));
}

function inferTimestampScale(segments: TranscriptSegment[], durationSec: number): number {
  const maxEnd = Math.max(0, ...segments.map((segment) => segment.endSec));
  if (maxEnd <= durationSec * 1.4) return 1;
  if (maxEnd > durationSec * 8) return 1000;
  return 1;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function parseSegments(raw: unknown): TranscriptSegment[] {
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.segments)) return [];

  const segments: TranscriptSegment[] = [];
  for (const item of obj.segments) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const text = typeof row.text === 'string' ? row.text.trim() : '';
    if (!text) continue;

    const words: TranscriptWord[] = [];
    if (Array.isArray(row.words)) {
      for (const word of row.words) {
        if (!word || typeof word !== 'object') continue;
        const w = word as Record<string, unknown>;
        const wordText = typeof w.text === 'string' ? w.text.trim() : '';
        if (!wordText) continue;
        words.push({
          text: wordText,
          startSec: asNumber(w.startSec, 0),
          endSec: asNumber(w.endSec, 0),
        });
      }
    }

    segments.push({
      text,
      startSec: asNumber(row.startSec, 0),
      endSec: asNumber(row.endSec, 0),
      words,
    });
  }
  return segments;
}

export function sanitizeTranscript(transcript: TranscriptResult, durationSec: number): TranscriptResult {
  const duration = Math.max(durationSec, 0.1);
  const scale = inferTimestampScale(transcript.segments, duration);
  const scaled: TranscriptSegment[] = transcript.segments.map((segment) => ({
    ...segment,
    startSec: segment.startSec / scale,
    endSec: segment.endSec / scale,
    words: segment.words.map((word) => ({
      ...word,
      startSec: word.startSec / scale,
      endSec: word.endSec / scale,
    })),
  }));

  const segments: TranscriptSegment[] = [];

  for (const raw of scaled) {
    const text = raw.text.trim();
    if (!text) continue;

    let startSec = clamp(raw.startSec, 0, duration);
    let endSec = clamp(raw.endSec, 0, duration);
    if (endSec <= startSec) endSec = Math.min(duration, startSec + 0.4);

    const expectedWords = text.split(/\s+/).filter(Boolean);
    let words =
      raw.words.length > 0 && raw.words.length <= expectedWords.length * 3
        ? raw.words.map((word) => {
            const start = clamp(word.startSec, startSec, endSec);
            return {
              text: word.text.trim(),
              startSec: start,
              endSec: clamp(word.endSec, start + 0.04, endSec),
            };
          }).filter((word) => word.text)
        : splitTextAsWords(text, startSec, endSec);

    if (words.length === 0) words = splitTextAsWords(text, startSec, endSec);

    for (let i = 1; i < words.length; i++) {
      const prev = words[i - 1]!;
      const cur = words[i]!;
      if (cur.startSec < prev.endSec) {
        cur.startSec = prev.endSec;
        if (cur.endSec <= cur.startSec) {
          cur.endSec = Math.min(endSec, cur.startSec + 0.08);
        }
      }
    }

    segments.push({ text, startSec, endSec, words });
  }

  segments.sort((a, b) => a.startSec - b.startSec);
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1]!;
    const cur = segments[i]!;
    if (cur.startSec < prev.endSec) {
      cur.startSec = prev.endSec;
      if (cur.endSec <= cur.startSec) {
        cur.endSec = Math.min(duration, cur.startSec + 0.3);
      }
    }
  }

  return {
    language: transcript.language || config.captions.language,
    segments: segments.filter((segment) => segment.endSec > segment.startSec && segment.text),
  };
}

function buildPrompt(durationSec: number, hintText?: string): string {
  const duration = durationSec.toFixed(2);
  const hint = hintText?.trim();
  const alignment = hint
    ? [
        'O texto falado é EXATAMENTE o bloco abaixo (narração gerada). Alinhe as palavras a ele, sem alterar, omitir ou acrescentar:',
        '"""',
        hint,
        '"""',
      ].join('\n')
    : 'Transcreva só o que for claramente falado. Não invente fala. Silêncio não vira segmento.';

  return [
    'Você gera legendas sincronizadas para um vídeo em português.',
    `Duração do áudio: ${duration} segundos. Todos os timestamps (startSec/endSec) devem estar em [0, ${duration}].`,
    'Idioma principal: ' + config.captions.language + '.',
    'segments: frases curtas de 4 a 10 palavras, na ordem da fala, sem sobreposição.',
    'words: cada palavra com startSec/endSec monotônicos dentro do segmento.',
    'Números em segundos (float). Não use timecode MM:SS.',
    alignment,
  ].join('\n');
}

async function callGemini(
  model: string,
  audioPath: string,
  durationSec: number,
  hintText?: string,
): Promise<TranscriptResult> {
  const apiKey = config.christian.geminiApiKey;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurado no .env — necessário para gerar legendas.');
  }

  const audio = await fsp.readFile(audioPath);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: {
      parts: [{ text: 'Você é um alinhador de legendas. Responda só o JSON pedido, com timestamps fiéis ao áudio.' }],
    },
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: mimeForAudio(audioPath), data: audio.toString('base64') } },
          { text: buildPrompt(durationSec, hintText) },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: CAPTION_RESPONSE_SCHEMA,
      temperature: 0.1,
    },
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `Não foi possível conectar ao Gemini para legendas. (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  if (response.status === 429) {
    throw new Error('Cota do Gemini excedida (429) ao gerar legendas.');
  }
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(`Gemini legendas respondeu ${response.status}: ${bodyText.slice(0, 300)}`);
  }

  const payload = (await response.json()) as GeminiResponse;
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  if (!text.trim()) {
    throw new Error('Gemini retornou uma resposta vazia para as legendas.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gemini não retornou JSON válido para as legendas.');
  }

  const language =
    parsed && typeof parsed === 'object' && typeof (parsed as { language?: unknown }).language === 'string'
      ? (parsed as { language: string }).language
      : config.captions.language;

  return sanitizeTranscript({ language, segments: parseSegments(parsed) }, durationSec);
}

/**
 * Transcreve um arquivo de áudio via Gemini (áudio + JSON estruturado).
 * `hintText` força o alinhamento ao roteiro já conhecido (narração TTS).
 */
export async function transcribeAudioWithGemini(options: {
  audioPath: string;
  durationSec: number;
  hintText?: string;
}): Promise<TranscriptResult> {
  const models = buildModelChain(config.captions.geminiModel, config.captions.geminiModelFallbacks);
  if (!models[0]) {
    throw new Error('GEMINI_CAPTIONS_MODEL / GEMINI_MODEL não configurado.');
  }
  log.info(`transcrevendo ${options.audioPath} (${options.durationSec.toFixed(1)}s) via ${models.join(', ')}`);
  return withGeminiModelFallback(models, (model) =>
    callGemini(model, options.audioPath, options.durationSec, options.hintText),
  );
}
