import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config, repoRoot } from '@editor-video/core';

function runPiper(text: string, model: string, outputWav: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.piper.bin, ['--model', model, '--output_file', outputWav], {
      windowsHide: true,
    });

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-8000);
    });

    child.on('error', (err) => {
      reject(
        new Error(
          `Não foi possível executar "${config.piper.bin}". Instale o Piper e configure PIPER_BIN. (${err.message})`,
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

async function resolveModel(): Promise<string> {
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

/** Gera WAV de narração com Piper. */
export async function synthesizeSpeech(text: string, outputWav: string): Promise<void> {
  const model = await resolveModel();
  await fsp.mkdir(path.dirname(outputWav), { recursive: true });
  await runPiper(text, model, outputWav);

  try {
    await fsp.access(outputWav);
  } catch {
    throw new Error('Piper não gerou o arquivo WAV esperado.');
  }
}
