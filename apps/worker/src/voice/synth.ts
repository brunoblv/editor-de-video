import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from '@editor-video/core';
import { runFfmpeg } from '../ffmpeg.js';
import { logger } from '../logger.js';
import { synthesizeSegmentWithPiper } from './providers/piper.js';
import { synthesizeGroupWithGeminiTts } from './providers/gemini-tts.js';
import type { DirectedScript, SegmentSource, VoiceSegment } from './types.js';

const log = logger('voice');

/** Formato canônico de todos os trechos antes da concatenação — permite usar
 * "-c copy" no passo final não importa qual provider gerou cada trecho. */
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

function groupBySource(segments: VoiceSegment[]): Array<{ source: SegmentSource; segments: VoiceSegment[] }> {
  const groups: Array<{ source: SegmentSource; segments: VoiceSegment[] }> = [];
  for (const segment of segments) {
    const last = groups[groups.length - 1];
    if (last && last.source === segment.source) last.segments.push(segment);
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

async function synthesizeWithPiper(script: DirectedScript, outputWav: string, workDir: string): Promise<void> {
  const parts: string[] = [];

  for (const [index, segment] of script.segments.entries()) {
    const rawPath = path.join(workDir, `piper-seg-${index}.wav`);
    await synthesizeSegmentWithPiper(segment, rawPath);

    const canonicalPath = path.join(workDir, `piper-seg-${index}-16k.wav`);
    await resampleToCanonical(rawPath, canonicalPath);
    parts.push(canonicalPath);

    if (segment.pauseAfterMs > 0) {
      const silPath = path.join(workDir, `piper-sil-${index}.wav`);
      await generateSilenceWav(silPath, segment.pauseAfterMs);
      parts.push(silPath);
    }
  }

  await concatWavs(parts, outputWav, workDir);
}

export interface SynthesizeResult {
  provider: 'gemini' | 'piper';
}

/**
 * Sintetiza um DirectedScript num único WAV. Tenta Gemini TTS primeiro
 * (config.voiceDirector.provider === 'gemini'); qualquer falha (cota, rede,
 * resposta inválida) cai para o Piper local — o vídeo nunca é perdido por
 * indisponibilidade de um provider (docs/Cristão/projeto.md §49).
 */
export async function synthesizeDirectedScript(
  script: DirectedScript,
  outputWav: string,
  workDir: string,
): Promise<SynthesizeResult> {
  await fsp.mkdir(workDir, { recursive: true });

  if (config.voiceDirector.provider === 'gemini') {
    try {
      await synthesizeWithGemini(script, outputWav, workDir);
      return { provider: 'gemini' };
    } catch (err) {
      log.warn(`Gemini TTS indisponível, usando Piper como fallback: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await synthesizeWithPiper(script, outputWav, workDir);
  return { provider: 'piper' };
}
