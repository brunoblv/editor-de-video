/**
 * Execução de subprocessos por argumentos estruturados — nunca shell nem
 * interpolação de strings (§19). Suporta cancelamento (mata o processo e
 * deixa a limpeza de temporários para o chamador), timeout e ambiente
 * mínimo (sem segredos herdados) para código não confiável.
 */
import { spawn } from 'node:child_process';

export type RunOptions = {
  cwd?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Ambiente explícito. Por padrão herda só PATH/SYSTEMROOT/TEMP/HOME. */
  env?: NodeJS.ProcessEnv;
  inheritFullEnv?: boolean;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  /** Quantos caracteres finais de stderr manter para diagnóstico. */
  stderrTailChars?: number;
  /** Limite de stdout acumulado (evita estourar memória com saídas grandes). */
  maxStdoutChars?: number;
};

export class ProcessError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly stderr: string,
    readonly cancelled: boolean,
    readonly timedOut: boolean,
  ) {
    super(message);
    this.name = 'ProcessError';
  }
}

const SAFE_ENV_KEYS = ['PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LANG', 'APPDATA', 'LOCALAPPDATA', 'PATHEXT', 'COMSPEC'];

export function minimalEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENV_KEYS) if (process.env[key] !== undefined) env[key] = process.env[key];
  return { ...env, ...extra };
}

export function runProcess(
  bin: string,
  args: string[],
  options: RunOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  if (args.some((a) => typeof a !== 'string')) throw new TypeError('Argumentos devem ser strings');
  const tail = options.stderrTailChars ?? 8000;
  const maxStdout = options.maxStdoutChars ?? 50_000_000;

  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new ProcessError(`${bin} cancelado antes de iniciar`, null, '', true, false));
      return;
    }
    const child = spawn(bin, args, {
      cwd: options.cwd,
      env: options.inheritFullEnv ? process.env : (options.env ?? minimalEnv()),
      windowsHide: true,
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    let cancelled = false;
    let timedOut = false;

    const kill = () => {
      if (child.exitCode === null) child.kill('SIGKILL');
    };
    const onAbort = () => {
      cancelled = true;
      kill();
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          kill();
        }, options.timeoutMs)
      : null;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (stdout.length < maxStdout) stdout += chunk;
      options.onStdout?.(chunk);
    });
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-tail);
      options.onStderr?.(chunk);
    });
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      reject(new ProcessError(`Não foi possível executar "${bin}": ${err.message}`, null, stderr, false, false));
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      if (code === 0 && !cancelled && !timedOut) {
        resolve({ stdout, stderr });
        return;
      }
      const reason = cancelled ? 'cancelado' : timedOut ? `excedeu ${options.timeoutMs}ms` : `saiu com código ${code}`;
      reject(new ProcessError(`${bin} ${reason}: ${stderr.slice(-1500)}`, code, stderr, cancelled, timedOut));
    });
  });
}

export type ToolPaths = { ffmpeg: string; ffprobe: string };

export function toolPaths(): ToolPaths {
  return {
    ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg',
    ffprobe: process.env.FFPROBE_PATH || 'ffprobe',
  };
}

/** Versões das ferramentas, para registrar o ambiente de render (§19). */
export async function toolVersions(paths: ToolPaths = toolPaths()): Promise<Record<string, string>> {
  const first = async (bin: string, args: string[]) => {
    try {
      const { stdout } = await runProcess(bin, args, { timeoutMs: 15_000 });
      return stdout.split(/\r?\n/)[0]?.trim() ?? 'desconhecida';
    } catch {
      return 'indisponível';
    }
  };
  return {
    ffmpeg: await first(paths.ffmpeg, ['-version']),
    ffprobe: await first(paths.ffprobe, ['-version']),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
  };
}
