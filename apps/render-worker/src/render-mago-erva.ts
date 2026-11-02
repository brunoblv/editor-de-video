/**
 * Vídeo de erva do Mago da Meia-Noite, renderizado neste PC e enviado depois
 * ao site (npm run video:upload no blog). Narra cena a cena com Gemini TTS e
 * ajusta a duração de cada cena à fala.
 *
 * Uso: npm run mago:erva -w @editor-video/render-worker -- <roteiro.json> <saida.mp4>
 */
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectMedia, renderComposition, runProcess } from '@editor-video/integrations';

type Roteiro = {
  eyebrow?: string;
  hook: string;
  points: [Point, Point, Point];
  closing: string;
  cta: string;
  signature?: string;
};
type Point = { title: string; text: string };

const VOICE_STYLE = 'Narre em português do Brasil, com voz calma, grave e reflexiva, sem pressa';
const PAUSE_AFTER_SCENE_SEC = 0.4;
const HOLD_AT_END_SEC = 1.5;

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
async function synthesize(text: string): Promise<Buffer> {
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
        contents: [{ parts: [{ text: `${VOICE_STYLE}: ${text}` }] }],
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

async function main() {
  const [roteiroPath, outputArg] = process.argv.slice(2);
  if (!roteiroPath || !outputArg) throw new Error('Uso: <roteiro.json> <saida.mp4>');
  const roteiro = JSON.parse(await fsp.readFile(roteiroPath, 'utf8')) as Roteiro;
  const output = path.resolve(outputArg);
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mago-erva-'));

  try {
    const lines = [roteiro.hook, ...roteiro.points.map((point) => point.text), `${roteiro.closing} ${roteiro.cta}.`];
    const sceneSecs: number[] = [];
    const sceneFiles: string[] = [];
    for (const [index, line] of lines.entries()) {
      console.log(`narrando cena ${index + 1}/${lines.length}`);
      const raw = path.join(workDir, `raw-${index}.wav`);
      const padded = path.join(workDir, `scene-${index}.wav`);
      await fsp.writeFile(raw, await synthesize(line));
      const pause = index === lines.length - 1 ? HOLD_AT_END_SEC : PAUSE_AFTER_SCENE_SEC;
      await runProcess('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', `apad=pad_dur=${pause}`, padded]);
      const sceneSec = (await inspectMedia(padded)).durationSec;
      if (!sceneSec) throw new Error(`Narração da cena ${index + 1} sem duração`);
      sceneSecs.push(sceneSec);
      sceneFiles.push(padded);
    }
    const durationSec = sceneSecs.reduce((sum, value) => sum + value, 0);
    console.log(`duração: ${durationSec.toFixed(1)} s`);

    const listFile = path.join(workDir, 'list.txt');
    await fsp.writeFile(listFile, sceneFiles.map((file) => `file '${file.replaceAll('\\', '/')}'`).join('\n'));
    const narration = path.join(workDir, 'narration.m4a');
    await runProcess('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', narration]);

    const [point1, point2, point3] = roteiro.points;
    const round = (value: number) => Math.round(value * 100) / 100;
    console.log('renderizando');
    const silent = path.join(workDir, 'video.mp4');
    await renderComposition({
      templateSlug: 'mago-erva',
      templateVersion: 1,
      params: {
        ...(roteiro.eyebrow ? { eyebrow: roteiro.eyebrow } : {}),
        ...(roteiro.signature ? { signature: roteiro.signature } : {}),
        hook: roteiro.hook,
        point1Title: point1.title,
        point1Text: point1.text,
        point2Title: point2.title,
        point2Text: point2.text,
        point3Title: point3.title,
        point3Text: point3.text,
        closing: roteiro.closing,
        cta: roteiro.cta,
        hookSec: round(sceneSecs[0]!),
        point1Sec: round(sceneSecs[1]!),
        point2Sec: round(sceneSecs[2]!),
        point3Sec: round(sceneSecs[3]!),
      },
      width: 1080,
      height: 1920,
      durationSec,
      quality: 'final',
      workDir,
      outputPath: silent,
    });

    await fsp.mkdir(path.dirname(output), { recursive: true });
    await runProcess('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', narration, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', output]);
    console.log(`pronto: ${output}`);
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
