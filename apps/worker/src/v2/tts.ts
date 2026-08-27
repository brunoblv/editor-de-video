import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config, repoRoot } from '@editor-video/core';
import { prepareTextForSpeech } from '../voice/pronunciation.js';

/**
 * PIPER_BIN pode ser um comando no PATH ("piper") ou um caminho — nesse caso é
 * relativo à raiz do monorepo, já que cada app roda de um cwd diferente.
 */
function resolvePiperBin(): string {
  const bin = config.piper.bin;
  const looksLikePath = bin.includes('/') || bin.includes('\\');
  if (!looksLikePath || path.isAbsolute(bin)) return bin;
  return path.resolve(repoRoot, bin);
}

export interface PiperSegmentOptions {
  lengthScale: number;
  sentenceSilence: number;
}

/** Roda o Piper para um texto único, com length_scale/sentence_silence explícitos. */
export function runPiperSegment(
  text: string,
  model: string,
  outputWav: string,
  opts: PiperSegmentOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = resolvePiperBin();
    const child = spawn(
      bin,
      [
        '--model',
        model,
        '--output_file',
        outputWav,
        '--length_scale',
        String(opts.lengthScale),
        '--sentence_silence',
        String(opts.sentenceSilence),
      ],
      { windowsHide: true },
    );

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-8000);
    });

    child.on('error', (err) => {
      reject(
        new Error(
          `Não foi possível executar "${bin}". Instale o Piper e configure PIPER_BIN. (${err.message})`,
        ),
      );
    });

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Piper saiu com código ${code}:\n${stderr}`));
    });

    child.stdin.write(text);
    child.stdin.end();
  });
}

export async function resolveModel(): Promise<string> {
  if (!config.piper.model.trim()) {
    throw new Error(
      'PIPER_MODEL não configurado. Baixe um modelo .onnx (ex. pt_BR) e defina o caminho no .env.',
    );
  }
  const model = path.isAbsolute(config.piper.model)
    ? config.piper.model
    : path.resolve(repoRoot, config.piper.model);

  try {
    await fsp.access(model);
  } catch {
    throw new Error(`Modelo Piper não encontrado em "${model}". Verifique PIPER_MODEL.`);
  }
  return model;
}

export interface SynthesizeOptions {
  /** Multiplicador final de --length_scale. Padrão: config.piper.lengthScale. */
  lengthScale?: number;
  /** Segundos de silêncio entre frases. Padrão: config.piper.sentenceSilence. */
  sentenceSilence?: number;
}

/** Gera WAV de narração com Piper (chamada única, sem segmentação por emoção). */
export async function synthesizeSpeech(
  text: string,
  outputWav: string,
  opts: SynthesizeOptions = {},
): Promise<void> {
  const model = await resolveModel();
  await fsp.mkdir(path.dirname(outputWav), { recursive: true });
  await runPiperSegment(prepareTextForSpeech(text), model, outputWav, {
    lengthScale: opts.lengthScale ?? config.piper.lengthScale,
    sentenceSilence: opts.sentenceSilence ?? config.piper.sentenceSilence,
  });

  try {
    await fsp.access(outputWav);
  } catch {
    throw new Error('Piper não gerou o arquivo WAV esperado.');
  }
}
