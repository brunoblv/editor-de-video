/**
 * Vídeo de erva do Mago da Meia-Noite, renderizado neste PC e enviado depois
 * ao site (npm run video:upload no blog). Narra cena a cena com Gemini TTS e
 * ajusta a duração de cada cena à fala.
 *
 * Uso: npm run mago:erva -w @editor-video/render-worker -- <roteiro.json> <saida.mp4>
 */
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { renderComposition } from '@editor-video/integrations';
import { muxNarration, narrateScenes } from './narration.js';

type Roteiro = {
  eyebrow?: string;
  hook: string;
  points: [Point, Point, Point];
  closing: string;
  cta: string;
  signature?: string;
};
type Point = { title: string; text: string };

const VOICE_STYLE = 'Narre em português do Brasil, com voz calma, grave e reflexiva, sem pressa';
const PAUSE_AFTER_SCENE_SEC = 0.4;
const HOLD_AT_END_SEC = 1.5;

async function main() {
  const [roteiroPath, outputArg] = process.argv.slice(2);
  if (!roteiroPath || !outputArg) throw new Error('Uso: <roteiro.json> <saida.mp4>');
  const roteiro = JSON.parse(await fsp.readFile(roteiroPath, 'utf8')) as Roteiro;
  const output = path.resolve(outputArg);
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mago-erva-'));

  try {
    const lines = [roteiro.hook, ...roteiro.points.map((point) => point.text), `${roteiro.closing} ${roteiro.cta}.`];
    const { sceneSecs, narrationPath } = await narrateScenes(lines, {
      workDir,
      voiceStyle: VOICE_STYLE,
      pauseSec: PAUSE_AFTER_SCENE_SEC,
      holdAtEndSec: HOLD_AT_END_SEC,
    });
    const durationSec = sceneSecs.reduce((sum, value) => sum + value, 0);
    console.log(`duração: ${durationSec.toFixed(1)} s`);

    const [point1, point2, point3] = roteiro.points;
    const round = (value: number) => Math.round(value * 100) / 100;
    console.log('renderizando');
    const silent = path.join(workDir, 'video.mp4');
    await renderComposition({
      templateSlug: 'mago-erva',
      templateVersion: 1,
      params: {
        ...(roteiro.eyebrow ? { eyebrow: roteiro.eyebrow } : {}),
        ...(roteiro.signature ? { signature: roteiro.signature } : {}),
        hook: roteiro.hook,
        point1Title: point1.title,
        point1Text: point1.text,
        point2Title: point2.title,
        point2Text: point2.text,
        point3Title: point3.title,
        point3Text: point3.text,
        closing: roteiro.closing,
        cta: roteiro.cta,
        hookSec: round(sceneSecs[0]!),
        point1Sec: round(sceneSecs[1]!),
        point2Sec: round(sceneSecs[2]!),
        point3Sec: round(sceneSecs[3]!),
      },
      width: 1080,
      height: 1920,
      durationSec,
      quality: 'final',
      workDir,
      outputPath: silent,
    });

    await muxNarration(silent, narrationPath, output);
    console.log(`pronto: ${output}`);
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
