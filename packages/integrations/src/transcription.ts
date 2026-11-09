/**
 * Adaptadores de transcrição (§15). O domínio só conhece a interface; o
 * provedor (whisper.cpp hoje, faster-whisper como candidato) é escolhido por
 * configuração e comparado no hardware real. A transcrição é sempre do
 * ORIGINAL: correções de texto nunca cortam mídia (RF-06).
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess, toolPaths, type ToolPaths } from './process.js';

/** `confidence` (0–1) quando o provedor informa (faster-whisper). */
export type TranscriptWord = { text: string; startSec: number; endSec: number; confidence?: number };
export type TranscriptSegment = { text: string; startSec: number; endSec: number; words: TranscriptWord[] };
export type Transcript = {
  language: string;
  segments: TranscriptSegment[];
  provider: string;
  model: string;
};

export interface TranscriptionProvider {
  readonly name: string;
  readonly model: string;
  transcribe(file: string, options: TranscribeOptions): Promise<Transcript>;
}

export type TranscribeOptions = {
  language?: string;
  signal?: AbortSignal;
  /** Canto com instrumental: desliga filtros de voz que cortam a música. */
  music?: boolean;
};

type WhisperCppToken = { text?: string; offsets?: { from?: number; to?: number } };
type WhisperCppSegment = { text?: string; offsets?: { from?: number; to?: number }; tokens?: WhisperCppToken[] };

/** whisper.cpp (`whisper-cli`), já usado pelo legado. Extrai WAV 16k mono antes. */
export class WhisperCppProvider implements TranscriptionProvider {
  readonly name = 'whisper.cpp';

  constructor(
    private readonly bin: string,
    readonly model: string,
    private readonly paths: ToolPaths = toolPaths(),
  ) {}

  async transcribe(file: string, options: TranscribeOptions): Promise<Transcript> {
    if (!this.model) throw new Error('WHISPER_MODEL não configurado (caminho do modelo ggml).');
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'whisper-'));
    try {
      const wav = path.join(dir, 'audio.wav');
      await runProcess(this.paths.ffmpeg, ['-y', '-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], { signal: options.signal });
      const outBase = path.join(dir, 'out');
      await runProcess(
        this.bin,
        ['-m', this.model, '-f', wav, '-l', options.language ?? 'auto', '-oj', '-ojf', '-of', outBase, '-ml', '1'],
        { signal: options.signal, inheritFullEnv: true },
      );
      const raw = JSON.parse(await fsp.readFile(`${outBase}.json`, 'utf8')) as {
        result?: { language?: string };
        transcription?: WhisperCppSegment[];
      };
      return {
        language: raw.result?.language ?? options.language ?? 'und',
        provider: this.name,
        model: path.basename(this.model),
        segments: mergeWhisperCpp(raw.transcription ?? []),
      };
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  }
}

/** Com `-ml 1` cada segmento é ~uma palavra; reagrupa em frases por pontuação/pausa. */
export function mergeWhisperCpp(items: WhisperCppSegment[]): TranscriptSegment[] {
  const words: TranscriptWord[] = items
    .map((s) => ({ text: (s.text ?? '').trim(), startSec: (s.offsets?.from ?? 0) / 1000, endSec: (s.offsets?.to ?? 0) / 1000 }))
    .filter((w) => w.text.length > 0 && !/^\[.*\]$/.test(w.text));
  const segments: TranscriptSegment[] = [];
  let current: TranscriptWord[] = [];
  const flush = () => {
    if (current.length === 0) return;
    segments.push({
      text: current.map((w) => w.text).join(' ').replace(/\s+([,.!?;:])/g, '$1'),
      startSec: current[0]!.startSec,
      endSec: current[current.length - 1]!.endSec,
      words: current,
    });
    current = [];
  };
  for (const [i, word] of words.entries()) {
    const prev = words[i - 1];
    if (prev && word.startSec - prev.endSec > 0.8) flush();
    current.push(word);
    if (/[.!?]$/.test(word.text) || current.length >= 14) flush();
  }
  flush();
  return segments;
}

/** faster-whisper via script Python do worker de mídia (workers/media). */
export class FasterWhisperProvider implements TranscriptionProvider {
  readonly name = 'faster-whisper';

  constructor(
    private readonly python: string,
    private readonly script: string,
    readonly model: string,
  ) {}

  async transcribe(file: string, options: TranscribeOptions): Promise<Transcript> {
    const { stdout } = await runProcess(
      this.python,
      ['-I', this.script, '--model', this.model, '--input', file, ...(options.language ? ['--language', options.language] : []), ...(options.music ? ['--no-vad'] : [])],
      { signal: options.signal, inheritFullEnv: true, timeoutMs: 30 * 60_000 },
    );
    const data = JSON.parse(stdout) as { language: string; segments: TranscriptSegment[] };
    return { ...data, provider: this.name, model: this.model };
  }
}

/** Script do repositório, independente do diretório de onde o worker foi iniciado. */
const DEFAULT_FASTER_WHISPER_SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'workers', 'media', 'transcribe.py');

/** Ambiente Python isolado sugerido em docs/v3/reactive-lyrics.md. */
export function defaultWhisperVenvPython(): string {
  return path.join(os.homedir(), '.cache', 'editor-video', 'whisper-venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
}

export function transcriptionProviderFromEnv(): TranscriptionProvider {
  const provider = process.env.TRANSCRIPTION_PROVIDER ?? 'whisper.cpp';
  if (provider === 'faster-whisper') {
    return new FasterWhisperProvider(
      process.env.PYTHON_BIN ?? 'python',
      process.env.FASTER_WHISPER_SCRIPT ?? DEFAULT_FASTER_WHISPER_SCRIPT,
      process.env.FASTER_WHISPER_MODEL ?? 'small',
    );
  }
  return new WhisperCppProvider(process.env.WHISPER_BIN ?? 'whisper-cli', process.env.WHISPER_MODEL ?? '');
}

/**
 * Provedor para transcrever letra cantada (Reactive Lyrics): faster-whisper
 * do venv padrão ou o configurado em LYRICS_PYTHON_BIN; senão o provedor
 * geral. Erro legível quando nada está instalado.
 */
export function lyricsTranscriptionProvider(): TranscriptionProvider {
  const python = process.env.LYRICS_PYTHON_BIN || (fs.existsSync(defaultWhisperVenvPython()) ? defaultWhisperVenvPython() : null);
  const model = process.env.LYRICS_WHISPER_MODEL || 'small';
  if (python) return new FasterWhisperProvider(python, process.env.FASTER_WHISPER_SCRIPT ?? DEFAULT_FASTER_WHISPER_SCRIPT, model);
  if (process.env.TRANSCRIPTION_PROVIDER === 'faster-whisper') return transcriptionProviderFromEnv();
  const bin = process.env.WHISPER_BIN;
  if (bin && process.env.WHISPER_MODEL && fs.existsSync(process.env.WHISPER_MODEL)) return transcriptionProviderFromEnv();
  throw Object.assign(
    new Error(
      'Nenhum Whisper instalado para transcrever a letra. Instale o faster-whisper: python -m venv ~/.cache/editor-video/whisper-venv e depois pip install -r workers/media/requirements.txt nesse ambiente (ou defina LYRICS_PYTHON_BIN).',
    ),
    { category: 'DEPENDENCY_MISSING' },
  );
}
