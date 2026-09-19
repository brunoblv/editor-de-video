import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config, repoRoot, type CaptionSegment, type CaptionWord } from '@editor-video/core';

/** Formato persistido em Clip.transcriptJson. */
export type TranscriptWord = {
  text: string;
  startSec: number;
  endSec: number;
};

export type TranscriptSegment = {
  text: string;
  startSec: number;
  endSec: number;
  words: TranscriptWord[];
};

export type TranscriptResult = {
  language: string;
  segments: TranscriptSegment[];
};

interface WhisperJsonToken {
  text?: string;
  offsets?: { from?: number; to?: number };
}

interface WhisperJsonSegment {
  text?: string;
  offsets?: { from?: number; to?: number };
  tokens?: WhisperJsonToken[];
}

interface WhisperJsonFile {
  result?: { language?: string };
  transcription?: WhisperJsonSegment[];
}

function run(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-8000);
    });

    child.on('error', (err) => {
      reject(
        new Error(
          `Não foi possível executar "${bin}". Instale o whisper.cpp e configure WHISPER_BIN. (${err.message})`,
        ),
      );
    });
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} saiu com código ${code}:\n${stderr}`));
    });
  });
}

export async function isWhisperReady(): Promise<boolean> {
  try {
    await assertWhisperReady();
    return true;
  } catch {
    return false;
  }
}

async function assertWhisperReady(): Promise<string> {
  if (!config.whisper.enabled) {
    throw new Error(
      'Legendas automáticas estão desabilitadas (WHISPER_ENABLED=false). Ative no .env ou desmarque o toggle do clipe.',
    );
  }

  if (!config.whisper.model.trim()) {
    throw new Error(
      'WHISPER_MODEL não está configurado. Baixe um modelo ggml (ex.: ggml-base.bin) e defina o caminho no .env.',
    );
  }

  const model = path.isAbsolute(config.whisper.model)
    ? config.whisper.model
    : path.resolve(repoRoot, config.whisper.model);

  try {
    await fsp.access(model);
  } catch {
    throw new Error(
      `Modelo Whisper não encontrado em "${model}". Verifique WHISPER_MODEL.`,
    );
  }

  return model;
}

async function extractWav(inputVideo: string, outputWav: string): Promise<void> {
  await run('ffmpeg', [
    '-y',
    '-i',
    inputVideo,
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

function msToSec(ms: number): number {
  return Math.max(0, ms / 1000);
}

function parseWhisperJson(raw: WhisperJsonFile): TranscriptResult {
  const segments: TranscriptSegment[] = [];

  for (const item of raw.transcription ?? []) {
    const startSec = msToSec(item.offsets?.from ?? 0);
    const endSec = msToSec(item.offsets?.to ?? item.offsets?.from ?? 0);
    const text = (item.text ?? '').trim();
    if (!text && !(item.tokens?.length)) continue;

    const words: TranscriptWord[] = [];
    for (const token of item.tokens ?? []) {
      const wordText = token.text ?? '';
      if (!wordText.trim() || /^\[_.*_\]$/.test(wordText.trim())) continue;
      // Tokens do whisper.cpp às vezes vêm com espaços; agrupamos só tokens alfanuméricos úteis
      words.push({
        text: wordText,
        startSec: msToSec(token.offsets?.from ?? item.offsets?.from ?? 0),
        endSec: msToSec(token.offsets?.to ?? token.offsets?.from ?? 0),
      });
    }

    // Se os tokens forem sub-word demais, sintetiza palavras pelo texto do segmento
    const usableWords =
      words.length > 0 && words.length <= text.split(/\s+/).length * 3
        ? mergeSubwordTokens(words)
        : splitTextAsWords(text, startSec, endSec);

    segments.push({
      text: text || usableWords.map((w) => w.text).join(' '),
      startSec,
      endSec: Math.max(endSec, startSec + 0.05),
      words: usableWords,
    });
  }

  return {
    language: raw.result?.language ?? config.whisper.language,
    segments,
  };
}

/** Une tokens BPE em palavras (espaço no início do token = nova palavra). */
function mergeSubwordTokens(tokens: TranscriptWord[]): TranscriptWord[] {
  const words: TranscriptWord[] = [];
  for (const token of tokens) {
    const startsWord = token.text.startsWith(' ') || words.length === 0;
    const cleaned = token.text.trim();
    if (!cleaned) continue;

    if (startsWord || words.length === 0) {
      words.push({ text: cleaned, startSec: token.startSec, endSec: token.endSec });
    } else {
      const last = words[words.length - 1]!;
      last.text += cleaned;
      last.endSec = token.endSec;
    }
  }
  return words;
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

export function transcriptToCaptions(transcript: TranscriptResult, fps: number): CaptionSegment[] {
  return transcript.segments.map((segment) => {
    const words: CaptionWord[] = segment.words.map((word) => ({
      text: word.text,
      startFrame: Math.max(0, Math.round(word.startSec * fps)),
      endFrame: Math.max(1, Math.round(word.endSec * fps)),
    }));

    return {
      text: segment.text,
      startFrame: Math.max(0, Math.round(segment.startSec * fps)),
      endFrame: Math.max(1, Math.round(segment.endSec * fps)),
      words: words.length > 0 ? words : undefined,
    };
  });
}

async function runWhisperOnWav(wavPath: string, outBase: string): Promise<TranscriptResult> {
  const model = await assertWhisperReady();

  const args = [
    '-m',
    model,
    '-f',
    wavPath,
    '-l',
    config.whisper.language,
    '-ojf',
    '-ml', '48', '-sow',
    '-of',
    outBase,
    '--no-prints',
  ];

  try {
    await run(config.whisper.bin, args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Alguns builds usam o binário legado `main` sem --no-prints
    if (message.includes('--no-prints') || message.includes('unknown option')) {
      await run(config.whisper.bin, [
        '-m',
        model,
        '-f',
        wavPath,
        '-l',
        config.whisper.language,
        '-ojf',
        '-ml', '48', '-sow',
        '-of',
        outBase,
      ]);
    } else {
      throw err;
    }
  }

  const jsonPath = `${outBase}.json`;
  let rawText: string;
  try {
    rawText = await fsp.readFile(jsonPath, 'utf8');
  } catch {
    throw new Error(
      `Whisper não gerou o JSON esperado em ${jsonPath}. Confira WHISPER_BIN (whisper-cli) e o modelo.`,
    );
  }

  const parsed = JSON.parse(rawText) as WhisperJsonFile;
  return parseWhisperJson(parsed);
}

/**
 * Transcreve o áudio de um vídeo normalizado via whisper.cpp.
 * Retorna segmentos vazios quando não há fala detectável.
 */
export async function transcribeClip(options: {
  videoPath: string;
  workDir: string;
  clipId: string;
}): Promise<TranscriptResult> {
  const wavPath = path.join(options.workDir, `${options.clipId}.wav`);
  const outBase = path.join(options.workDir, `${options.clipId}-whisper`);
  await extractWav(options.videoPath, wavPath);
  return runWhisperOnWav(wavPath, outBase);
}

/** Transcreve um WAV já existente (ex.: narração Piper). */
export async function transcribeWav(options: {
  wavPath: string;
  workDir: string;
  id: string;
}): Promise<TranscriptResult> {
  const outBase = path.join(options.workDir, `${options.id}-whisper`);
  return runWhisperOnWav(options.wavPath, outBase);
}
