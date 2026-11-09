/**
 * Narração com Gemini TTS para os vídeos renderizados neste PC (mago:erva, mago:arquetipo).
 * Cada fala vira um WAV; a cena dura o tempo da fala mais uma pausa.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { inspectMedia, runProcess } from '@editor-video/integrations';

function wavFromPcm16(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Tenta os modelos em ordem; em cota excedida (429) passa para o próximo. */
export async function synthesize(text: string, voiceStyle: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurado');
  const models = [process.env.GEMINI_TTS_MODEL, ...(process.env.GEMINI_TTS_MODEL_FALLBACKS ?? '').split(',')]
    .map((model) => model?.trim())
    .filter((model): model is string => Boolean(model));

  let lastError = 'nenhum modelo configurado';
  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${voiceStyle}: ${text}` }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.GEMINI_TTS_VOICE ?? 'Orus' } } },
        },
      }),
    });
    if (!response.ok) {
      lastError = `${model} respondeu ${response.status}`;
      if (response.status === 429 || response.status === 404) continue;
      throw new Error(lastError);
    }
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>;
    };
    const audio = payload.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!audio?.data) {
      lastError = `${model} não retornou áudio`;
      continue;
    }
    const rate = Number(/rate=(\d+)/.exec(audio.mimeType ?? '')?.[1] ?? 24000);
    return wavFromPcm16(Buffer.from(audio.data, 'base64'), rate);
  }
  throw new Error(`Falha na narração: ${lastError}`);
}

/**
 * Narra cada linha, acrescenta a pausa da cena e junta tudo em um M4A normalizado.
 * Devolve a duração de cada cena (fala + pausa), que o template usa como tempo da cena.
 */
export async function narrateScenes(
  lines: string[],
  opts: { workDir: string; voiceStyle: string; pauseSec: number; holdAtEndSec: number },
): Promise<{ sceneSecs: number[]; narrationPath: string }> {
  const sceneSecs: number[] = [];
  const sceneFiles: string[] = [];
  for (const [index, line] of lines.entries()) {
    console.log(`narrando cena ${index + 1}/${lines.length}`);
    const raw = path.join(opts.workDir, `raw-${index}.wav`);
    const padded = path.join(opts.workDir, `scene-${index}.wav`);
    await fsp.writeFile(raw, await synthesize(line, opts.voiceStyle));
    const pause = index === lines.length - 1 ? opts.holdAtEndSec : opts.pauseSec;
    await runProcess('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', `apad=pad_dur=${pause}`, padded]);
    const sceneSec = (await inspectMedia(padded)).durationSec;
    if (!sceneSec) throw new Error(`Narração da cena ${index + 1} sem duração`);
    sceneSecs.push(sceneSec);
    sceneFiles.push(padded);
  }
  const listFile = path.join(opts.workDir, 'list.txt');
  await fsp.writeFile(listFile, sceneFiles.map((file) => `file '${file.replaceAll('\\', '/')}'`).join('\n'));
  const narrationPath = path.join(opts.workDir, 'narration.m4a');
  await runProcess('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', narrationPath]);
  return { sceneSecs, narrationPath };
}

/** Junta o vídeo mudo à narração, sem recodificar. */
export async function muxNarration(video: string, narration: string, output: string): Promise<void> {
  await fsp.mkdir(path.dirname(output), { recursive: true });
  await runProcess('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-i', narration, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', output]);
}
