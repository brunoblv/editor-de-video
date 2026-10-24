/**
 * Produção longa (Midnight, §3.1 / AC-13): renderiza segmentos reutilizáveis
 * e compõe com FFmpeg sem re-encode (concat demuxer, memória constante), em
 * vez de passar cada frame de horas por uma composição HTML. As emendas são
 * verificadas medindo o nível RMS do áudio imediatamente antes/depois.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { runProcess, toolPaths, type ToolPaths } from './process.js';

/**
 * Torna um segmento "loopável": crossfade do fim com o início (áudio e
 * vídeo), de modo que concatená-lo consigo mesmo não produza clique/salto.
 */
export async function makeSeamlessSegment(
  input: string,
  output: string,
  options: { segmentSec: number; crossfadeSec: number; signal?: AbortSignal },
  paths: ToolPaths = toolPaths(),
): Promise<void> {
  const { segmentSec: L, crossfadeSec: X } = options;
  if (X <= 0 || X * 2 >= L) throw new Error('crossfade deve ser > 0 e menor que metade do segmento');
  const body = L - X;
  // Saída = [X, L) com os últimos X segundos misturados ao início [0, X).
  const filter = [
    `[0:v]split[v1][v2]`,
    `[v1]trim=start=${X}:end=${L},setpts=PTS-STARTPTS[vbody]`,
    `[v2]trim=start=0:end=${X},setpts=PTS-STARTPTS[vhead]`,
    `[vbody][vhead]xfade=transition=fade:duration=${X}:offset=${body - X},format=yuv420p[v]`,
    `[0:a]asplit[a1][a2]`,
    `[a1]atrim=start=${X}:end=${L},asetpts=PTS-STARTPTS[abody]`,
    `[a2]atrim=start=0:end=${X},asetpts=PTS-STARTPTS[ahead]`,
    `[abody][ahead]acrossfade=d=${X}:c1=qsin:c2=qsin[a]`,
  ].join(';');
  await fsp.mkdir(path.dirname(output), { recursive: true });
  await runProcess(
    paths.ffmpeg,
    ['-y', '-v', 'error', '-t', String(L), '-i', input, '-filter_complex', filter, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-g', '60', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', output],
    { signal: options.signal },
  );
}

/**
 * Repete um segmento até `totalSec` com cópia de streams (sem re-encode).
 * Usa lista concat explícita para que as emendas fiquem em tempos conhecidos.
 */
export async function assembleLongFromSegment(
  segment: string,
  segmentSec: number,
  totalSec: number,
  output: string,
  options: { signal?: AbortSignal; workDir: string },
  paths: ToolPaths = toolPaths(),
): Promise<{ seamsSec: number[] }> {
  const count = Math.ceil(totalSec / segmentSec);
  await fsp.mkdir(options.workDir, { recursive: true });
  const listFile = path.join(options.workDir, 'concat.txt');
  const absolute = path.resolve(segment).replace(/\\/g, '/').replace(/'/g, "'\\''");
  await fsp.writeFile(listFile, Array.from({ length: count }, () => `file '${absolute}'`).join('\n'), 'utf8');
  const part = `${output}.part.mp4`;
  try {
    await runProcess(
      paths.ffmpeg,
      ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-t', String(totalSec), '-c', 'copy', '-movflags', '+faststart', part],
      { signal: options.signal },
    );
    await fsp.rename(part, output);
  } finally {
    await fsp.rm(part, { force: true });
  }
  const seamsSec = Array.from({ length: count - 1 }, (_, i) => (i + 1) * segmentSec).filter((t) => t < totalSec);
  return { seamsSec };
}

export type SeamReport = { timeSec: number; beforeDb: number; afterDb: number; jumpDb: number; ok: boolean };

async function rmsDb(file: string, startSec: number, durSec: number, paths: ToolPaths): Promise<number> {
  const { stderr } = await runProcess(
    paths.ffmpeg,
    ['-hide_banner', '-ss', startSec.toFixed(3), '-t', durSec.toFixed(3), '-i', file, '-vn', '-af', 'astats=metadata=0:reset=0', '-f', 'null', '-'],
    { stderrTailChars: 20_000, timeoutMs: 60_000 },
  );
  const matches = [...stderr.matchAll(/RMS level dB:\s*(-?[\d.]+|-inf)/g)];
  const overall = matches[matches.length - 1]?.[1];
  return overall === undefined || overall === '-inf' ? -120 : Number(overall);
}

/** Mede salto de nível em cada emenda; `maxJumpDb` padrão 3 dB. */
export async function verifySeams(
  file: string,
  seamsSec: number[],
  options: { windowSec?: number; maxJumpDb?: number } = {},
  paths: ToolPaths = toolPaths(),
): Promise<SeamReport[]> {
  const w = options.windowSec ?? 0.25;
  const max = options.maxJumpDb ?? 3;
  const reports: SeamReport[] = [];
  for (const t of seamsSec) {
    const beforeDb = await rmsDb(file, Math.max(0, t - w), w, paths);
    const afterDb = await rmsDb(file, t, w, paths);
    const jumpDb = Math.abs(afterDb - beforeDb);
    reports.push({ timeSec: t, beforeDb, afterDb, jumpDb, ok: jumpDb <= max });
  }
  return reports;
}
