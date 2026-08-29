import fsp from 'node:fs/promises';
import { config } from '@editor-video/core';

export class GeminiTtsUnavailableError extends Error {}

export interface GeminiTtsGroup {
  /** Textos dos segmentos do grupo, já unidos com marcadores de pausa ("..."). */
  text: string;
  styleInstruction: string;
}

interface GeminiTtsResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
  }>;
}

function wavFromPcm16(pcm: Buffer, sampleRate: number, channels = 1): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function sampleRateFromMimeType(mimeType: string | undefined): number {
  const match = /rate=(\d+)/.exec(mimeType ?? '');
  return match?.[1] ? Number(match[1]) : 24000;
}

async function callGeminiTts(group: GeminiTtsGroup): Promise<Buffer> {
  const apiKey = config.christian.geminiApiKey;
  if (!apiKey) throw new GeminiTtsUnavailableError('GEMINI_API_KEY não configurado.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.voiceDirector.geminiModel}:generateContent?key=${apiKey}`;
  const prompt = `${group.styleInstruction}: ${group.text}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voiceDirector.geminiVoiceName } },
          },
        },
      }),
    });
  } catch (err) {
    throw new GeminiTtsUnavailableError(
      `Falha de rede ao chamar Gemini TTS. (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  if (response.status === 429) {
    throw new GeminiTtsUnavailableError('Cota do Gemini TTS excedida (429).');
  }
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new GeminiTtsUnavailableError(`Gemini TTS respondeu ${response.status}: ${bodyText.slice(0, 300)}`);
  }

  const payload = (await response.json()) as GeminiTtsResponse;
  const part = payload.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!part?.data) {
    throw new GeminiTtsUnavailableError('Gemini TTS não retornou áudio.');
  }

  const pcm = Buffer.from(part.data, 'base64');
  const sampleRate = sampleRateFromMimeType(part.mimeType);
  return wavFromPcm16(pcm, sampleRate);
}

/**
 * Sintetiza um grupo de segmentos com Gemini TTS. Uma tentativa extra com
 * pequeno backoff em erros transitórios (rede/5xx); sem retry em 429.
 */
export async function synthesizeGroupWithGeminiTts(group: GeminiTtsGroup, outputWav: string): Promise<void> {
  try {
    const wav = await callGeminiTts(group);
    await fsp.writeFile(outputWav, wav);
  } catch (err) {
    if (err instanceof GeminiTtsUnavailableError && /429|cota/i.test(err.message)) {
      throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const wav = await callGeminiTts(group);
    await fsp.writeFile(outputWav, wav);
  }
}
