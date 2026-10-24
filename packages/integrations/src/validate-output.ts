/**
 * Validação técnica de entregas (§11): decodificável, duração com tolerância
 * documentada, dimensões/fps, áudio quando esperado, loudness/peak e sinais
 * de preto/silêncio — estes últimos são INFORMATIVOS (podem ser intencionais).
 */
import { inspectMedia, type MediaInfo } from './media.js';
import { runProcess, toolPaths, type ToolPaths } from './process.js';

export type OutputExpectations = {
  durationSec: number;
  /** Tolerância em segundos; padrão: 2 frames + 50ms. */
  durationToleranceSec?: number;
  width: number;
  height: number;
  fpsNum: number;
  fpsDen: number;
  expectAudio: boolean;
  /** Decodificar o arquivo inteiro (lento em vídeos longos; usar amostragem). */
  fullDecode?: boolean;
  measureLoudness?: boolean;
  /** Pular detecção de preto/silêncio (ex.: Ambient de horas). */
  skipBlackSilence?: boolean;
};

export type CheckResult = { id: string; status: 'pass' | 'fail' | 'warn' | 'info'; message: string };

export type ValidationReport = {
  ok: boolean;
  checks: CheckResult[];
  media: MediaInfo | null;
  loudness?: { integratedLufs: number; truePeakDb: number } | null;
};

export async function validateOutput(file: string, expect: OutputExpectations, paths: ToolPaths = toolPaths()): Promise<ValidationReport> {
  const checks: CheckResult[] = [];
  let media: MediaInfo | null = null;
  try {
    media = await inspectMedia(file, paths);
  } catch (err) {
    checks.push({ id: 'decodable', status: 'fail', message: `ffprobe falhou: ${(err as Error).message}` });
    return { ok: false, checks, media };
  }

  const fps = expect.fpsNum / expect.fpsDen;
  const tolerance = expect.durationToleranceSec ?? 2 / fps + 0.05;
  if (media.durationSec === null) {
    checks.push({ id: 'duration', status: 'fail', message: 'Duração ausente' });
  } else {
    const delta = Math.abs(media.durationSec - expect.durationSec);
    checks.push({
      id: 'duration',
      status: delta <= tolerance ? 'pass' : 'fail',
      message: `Duração ${media.durationSec.toFixed(3)}s (esperado ${expect.durationSec.toFixed(3)}s ± ${tolerance.toFixed(3)}s)`,
    });
  }

  if (!media.video) {
    checks.push({ id: 'video', status: 'fail', message: 'Sem stream de vídeo' });
  } else {
    const v = media.video;
    checks.push({
      id: 'dimensions',
      status: v.displayWidth === expect.width && v.displayHeight === expect.height ? 'pass' : 'fail',
      message: `${v.displayWidth}x${v.displayHeight} (esperado ${expect.width}x${expect.height})`,
    });
    const actualFps = v.fpsNum / v.fpsDen;
    checks.push({
      id: 'fps',
      status: Math.abs(actualFps - fps) < 0.01 ? 'pass' : 'fail',
      message: `${v.fpsNum}/${v.fpsDen} fps (esperado ${expect.fpsNum}/${expect.fpsDen})`,
    });
    checks.push({
      id: 'codec',
      status: v.codec === 'h264' && v.pixFmt === 'yuv420p' ? 'pass' : 'warn',
      message: `${v.codec ?? '?'} ${v.pixFmt ?? '?'}`,
    });
  }

  if (expect.expectAudio) {
    checks.push({ id: 'audio', status: media.audio ? 'pass' : 'fail', message: media.audio ? `${media.audio.codec} ${media.audio.sampleRate}Hz ${media.audio.channels}ch` : 'Áudio esperado ausente' });
  }

  if (expect.fullDecode) {
    try {
      await runProcess(paths.ffmpeg, ['-v', 'error', '-i', file, '-f', 'null', '-'], { stderrTailChars: 4000 });
      checks.push({ id: 'decodable', status: 'pass', message: 'Decodificação completa sem erros' });
    } catch (err) {
      checks.push({ id: 'decodable', status: 'fail', message: (err as Error).message.slice(0, 500) });
    }
  } else {
    checks.push({ id: 'decodable', status: 'pass', message: 'Cabeçalho e streams legíveis (decodificação completa não solicitada)' });
  }

  let loudness: ValidationReport['loudness'] = null;
  if (expect.measureLoudness && media.audio) {
    loudness = await measureLoudness(file, paths);
    if (loudness) {
      checks.push({
        id: 'loudness',
        status: loudness.truePeakDb > -0.5 ? 'warn' : 'info',
        message: `Integrado ${loudness.integratedLufs.toFixed(1)} LUFS, pico ${loudness.truePeakDb.toFixed(1)} dBTP`,
      });
    }
  }

  if (!expect.skipBlackSilence && media.video) {
    const black = await detectIntervals(file, paths, 'video');
    if (black.length > 0) checks.push({ id: 'black', status: 'info', message: `Trechos pretos: ${black.map((b) => `${b.start.toFixed(1)}–${b.end.toFixed(1)}s`).join(', ')}` });
    if (media.audio) {
      const silence = await detectIntervals(file, paths, 'audio');
      if (silence.length > 0) checks.push({ id: 'silence', status: 'info', message: `Silêncios: ${silence.map((s) => `${s.start.toFixed(1)}–${s.end.toFixed(1)}s`).join(', ')}` });
    }
  }

  return { ok: !checks.some((c) => c.status === 'fail'), checks, media, loudness };
}

export async function measureLoudness(file: string, paths: ToolPaths = toolPaths()): Promise<{ integratedLufs: number; truePeakDb: number } | null> {
  try {
    const { stderr } = await runProcess(
      paths.ffmpeg,
      ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'loudnorm=print_format=json', '-f', 'null', '-'],
      { stderrTailChars: 20_000 },
    );
    const json = /\{[\s\S]*"input_i"[\s\S]*?\}/.exec(stderr);
    if (!json) return null;
    const data = JSON.parse(json[0]) as { input_i: string; input_tp: string };
    return { integratedLufs: Number(data.input_i), truePeakDb: Number(data.input_tp) };
  } catch {
    return null;
  }
}

async function detectIntervals(file: string, paths: ToolPaths, kind: 'video' | 'audio'): Promise<Array<{ start: number; end: number }>> {
  const args =
    kind === 'video'
      ? ['-hide_banner', '-i', file, '-an', '-vf', 'blackdetect=d=0.5:pix_th=0.10', '-f', 'null', '-']
      : ['-hide_banner', '-i', file, '-vn', '-af', 'silencedetect=n=-50dB:d=1', '-f', 'null', '-'];
  try {
    const { stderr } = await runProcess(paths.ffmpeg, args, { stderrTailChars: 200_000 });
    const out: Array<{ start: number; end: number }> = [];
    if (kind === 'video') {
      for (const m of stderr.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)/g)) out.push({ start: Number(m[1]), end: Number(m[2]) });
    } else {
      let start: number | null = null;
      for (const line of stderr.split(/\r?\n/)) {
        const s = /silence_start: ([\d.]+)/.exec(line);
        if (s) start = Number(s[1]);
        const e = /silence_end: ([\d.]+)/.exec(line);
        if (e && start !== null) {
          out.push({ start, end: Number(e[1]) });
          start = null;
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}
