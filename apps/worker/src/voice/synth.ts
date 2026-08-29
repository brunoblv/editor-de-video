import fsp from 'node:fs/promises';
import path from 'node:path';
import { runFfmpeg } from '../ffmpeg.js';
import { prepareTextForSpeech } from './pronunciation.js';
import { synthesizeGroupWithGeminiTts } from './providers/gemini-tts.js';
import type { DirectedScript, SegmentSource, VoiceSegment } from './types.js';

/** Formato canônico dos trechos antes da concatenação (permite `-c copy` no mux final). */
const SAMPLE_RATE = 24000;

async function resampleToCanonical(input: string, output: string): Promise<void> {
  await runFfmpeg('ffmpeg', ['-y', '-i', input, '-ar', String(SAMPLE_RATE), '-ac', '1', '-c:a', 'pcm_s16le', output]);
}

async function generateSilenceWav(outputWav: string, ms: number): Promise<void> {
  const seconds = Math.max(ms, 0) / 1000;
  await runFfmpeg('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `anullsrc=r=${SAMPLE_RATE}:cl=mono`,
    '-t',
    seconds.toFixed(3),
    '-c:a',
    'pcm_s16le',
    outputWav,
  ]);
}

async function concatWavs(parts: string[], outputWav: string, workDir: string): Promise<void> {
  const listFile = path.join(workDir, 'concat-list.txt');
  const listContent = parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
  await fsp.writeFile(listFile, listContent, 'utf8');
  await runFfmpeg('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outputWav]);
}

/**
 * Agrupa por estilo de fala (emotion+styleInstruction), não por source —
 * script/reflection/cta com o mesmo estilo viram uma única chamada ao Gemini
 * TTS. Chamadas separadas para o mesmo estilo soam como vozes diferentes,
 * já que a síntese generativa não é idêntica entre requisições.
 */
function groupBySource(segments: VoiceSegment[]): Array<{ source: SegmentSource; segments: VoiceSegment[] }> {
  const groups: Array<{ source: SegmentSource; segments: VoiceSegment[] }> = [];
  for (const segment of segments) {
    const last = groups[groups.length - 1];
    const sameStyle =
      last && last.segments[0]!.emotion === segment.emotion && last.segments[0]!.styleInstruction === segment.styleInstruction;
    if (sameStyle) last!.segments.push(segment);
    else groups.push({ source: segment.source, segments: [segment] });
  }
  return groups;
}

async function synthesizeWithGemini(script: DirectedScript, outputWav: string, workDir: string): Promise<void> {
  const groups = groupBySource(script.segments);
  const parts: string[] = [];

  for (const [index, group] of groups.entries()) {
    const text = group.segments.map((s) => s.text).join(' ... ');
    const styleInstruction = group.segments[0]!.styleInstruction;
    const rawPath = path.join(workDir, `gemini-group-${index}.wav`);
    await synthesizeGroupWithGeminiTts({ text, styleInstruction }, rawPath);

    const canonicalPath = path.join(workDir, `gemini-group-${index}-16k.wav`);
    await resampleToCanonical(rawPath, canonicalPath);
    parts.push(canonicalPath);

    const pauseAfterMs = group.segments[group.segments.length - 1]!.pauseAfterMs;
    if (pauseAfterMs > 0) {
      const silPath = path.join(workDir, `gemini-sil-${index}.wav`);
      await generateSilenceWav(silPath, pauseAfterMs);
      parts.push(silPath);
    }
  }

  await concatWavs(parts, outputWav, workDir);
}

export interface SynthesizeResult {
  provider: 'gemini';
}

/**
 * Sintetiza um DirectedScript num único WAV via Gemini TTS.
 */
export async function synthesizeDirectedScript(
  script: DirectedScript,
  outputWav: string,
  workDir: string,
): Promise<SynthesizeResult> {
  await fsp.mkdir(workDir, { recursive: true });
  await synthesizeWithGemini(script, outputWav, workDir);
  return { provider: 'gemini' };
}

const CURIOSIDADE_STYLE =
  'Fale em português do Brasil, tom curioso e envolvente, ritmo natural para vídeo curto vertical';

/** Narração única (pipeline Curiosidade) via Gemini TTS. */
export async function synthesizePlainNarration(
  text: string,
  outputWav: string,
  workDir: string,
  styleInstruction = CURIOSIDADE_STYLE,
): Promise<void> {
  await synthesizeDirectedScript(
    {
      profileUsed: 'curiosidade',
      segments: [
        {
          text: prepareTextForSpeech(text),
          emotion: 'warm',
          lengthScale: 1,
          styleInstruction,
          intensity: 0.7,
          pauseAfterMs: 0,
          source: 'script',
        },
      ],
    },
    outputWav,
    workDir,
  );
}
