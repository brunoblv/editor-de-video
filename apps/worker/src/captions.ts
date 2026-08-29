import path from 'node:path';
import { config } from '@editor-video/core';
import { probe, runFfmpeg } from './ffmpeg.js';
import { transcribeAudioWithGemini } from './gemini-captions.js';
import { logger } from './logger.js';
import {
  isWhisperReady,
  transcribeClip as transcribeClipWithWhisper,
  transcribeWav as transcribeWavWithWhisper,
  type TranscriptResult,
} from './whisper.js';

export { transcriptToCaptions, type TranscriptResult, type TranscriptSegment, type TranscriptWord } from './whisper.js';

const log = logger('captions');

async function extractWav(input: string, outputWav: string): Promise<void> {
  await runFfmpeg('ffmpeg', [
    '-y',
    '-i',
    input,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-c:a',
    'pcm_s16le',
    outputWav,
  ]);
}

async function tryWhisperFallback(options: {
  wavPath: string;
  workDir: string;
  id: string;
  reason: unknown;
}): Promise<TranscriptResult> {
  if (!(await isWhisperReady())) {
    throw options.reason instanceof Error
      ? options.reason
      : new Error(String(options.reason));
  }
  log.warn(`Gemini falhou — caindo no Whisper`, options.reason);
  return transcribeWavWithWhisper({
    wavPath: options.wavPath,
    workDir: options.workDir,
    id: options.id,
  });
}

async function transcribeWavWithGemini(options: {
  wavPath: string;
  durationSec?: number;
  hintText?: string;
}): Promise<TranscriptResult> {
  const durationSec = options.durationSec ?? (await probe(options.wavPath)).durationSec;
  return transcribeAudioWithGemini({
    audioPath: options.wavPath,
    durationSec,
    hintText: options.hintText,
  });
}

/** Transcreve um WAV já existente (ex.: narração Gemini TTS). */
export async function transcribeWav(options: {
  wavPath: string;
  workDir: string;
  id: string;
  hintText?: string;
  durationSec?: number;
}): Promise<TranscriptResult> {
  if (config.captions.provider === 'whisper') {
    return transcribeWavWithWhisper({
      wavPath: options.wavPath,
      workDir: options.workDir,
      id: options.id,
    });
  }

  try {
    return await transcribeWavWithGemini({
      wavPath: options.wavPath,
      durationSec: options.durationSec,
      hintText: options.hintText,
    });
  } catch (err) {
    return tryWhisperFallback({
      wavPath: options.wavPath,
      workDir: options.workDir,
      id: options.id,
      reason: err,
    });
  }
}

/**
 * Transcreve o áudio de um vídeo normalizado.
 * Retorna segmentos vazios quando não há fala detectável.
 */
export async function transcribeClip(options: {
  videoPath: string;
  workDir: string;
  clipId: string;
  hintText?: string;
}): Promise<TranscriptResult> {
  if (config.captions.provider === 'whisper') {
    return transcribeClipWithWhisper({
      videoPath: options.videoPath,
      workDir: options.workDir,
      clipId: options.clipId,
    });
  }

  const wavPath = path.join(options.workDir, `${options.clipId}.wav`);
  await extractWav(options.videoPath, wavPath);

  try {
    return await transcribeWavWithGemini({
      wavPath,
      hintText: options.hintText,
    });
  } catch (err) {
    return tryWhisperFallback({
      wavPath,
      workDir: options.workDir,
      id: options.clipId,
      reason: err,
    });
  }
}

export function emptyTranscript(): TranscriptResult {
  return { language: config.captions.language || config.whisper.language, segments: [] };
}
