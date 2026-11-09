/**
 * Arquétipo narrado do Mago da Meia-Noite, renderizado neste PC. Narra cena a
 * cena com Gemini TTS e ajusta a duração de cada cena à fala.
 *
 * A arte entra recortada (PNG com transparência). Com "fundoBranco": true, uma
 * arte escura sobre fundo branco é recortada aqui mesmo: o alfa vem do menor
 * canal e a cor é "des-misturada" do branco, sem halo claro na borda.
 * "olhos" (em % da arte) acende os olhos na escuridão; sem ele, não há brilho.
 *
 * Uso: npm run mago:arquetipo -w @editor-video/render-worker -- <roteiro.json> <saida.mp4>
 */
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectMedia, renderComposition, runProcess } from '@editor-video/integrations';
import { muxNarration, narrateScenes } from './narration.js';

type Bloco = { title: string; text: string };
type Roteiro = {
  /** Caminho da arte, relativo ao roteiro ou absoluto. */
  art: string;
  fundoBranco?: boolean;
  olhos?: { lx: number; ly: number; rx: number; ry: number; cor?: string };
  eyebrow?: string;
  hook: string;
  name: string;
  epithet: string;
  lore: [Bloco, Bloco];
  gifts: [Bloco, Bloco, Bloco];
  shadow: Bloco;
  asks: string;
  closing: string;
  cta: string;
  signature?: string;
  accent?: string;
};

// "Sem pressa" deixava a fala lenta demais (o vídeo da pantera passou de 150 s).
const VOICE_STYLE = 'Narre em português do Brasil, com voz grave e calma, em tom de mistério, no ritmo natural de quem conta uma história, sem arrastar as palavras';
const PAUSE_AFTER_SCENE_SEC = 0.5;
const HOLD_AT_END_SEC = 2;

async function cutoutFromWhite(src: string, dest: string) {
  const m = 'min(min(r(X,Y),g(X,Y)),b(X,Y))';
  const alpha = `clip((248-${m})/88,0,1)`;
  const unblend = (ch: string) => `st(0,max(${alpha},0.001));clip((${ch}(X,Y)-(1-ld(0))*255)/ld(0),0,255)`;
  await runProcess('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', src,
    '-vf', `format=rgba,geq=r='${unblend('r')}':g='${unblend('g')}':b='${unblend('b')}':a='${alpha}*255'`,
    '-frames:v', '1', '-update', '1', dest,
  ]);
}

async function main() {
  const [roteiroPath, outputArg] = process.argv.slice(2);
  if (!roteiroPath || !outputArg) throw new Error('Uso: <roteiro.json> <saida.mp4>');
  const roteiro = JSON.parse(await fsp.readFile(roteiroPath, 'utf8')) as Roteiro;
  const output = path.resolve(outputArg);
  const artSource = path.resolve(path.dirname(roteiroPath), roteiro.art);
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mago-arquetipo-'));

  try {
    let art = artSource;
    if (roteiro.fundoBranco) {
      art = path.join(workDir, 'arte-recortada.png');
      await cutoutFromWhite(artSource, art);
    }
    const artInfo = (await inspectMedia(art)).video;
    if (!artInfo) throw new Error(`Arte sem imagem: ${artSource}`);

    const [lore1, lore2] = roteiro.lore;
    const [gift1, gift2, gift3] = roteiro.gifts;
    const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
    const lines = [
      roteiro.hook,
      `${roteiro.name}. ${roteiro.epithet}.`,
      `${lore1.title}. ${lore1.text}`,
      `${lore2.title}. ${lore2.text}`,
      `${gift1.title}. ${gift1.text}`,
      `${gift2.title}. ${gift2.text}`,
      `${gift3.title}. ${gift3.text}`,
      roteiro.shadow.text,
      `Em troca, pede ${lowerFirst(roteiro.asks)}`,
      `${roteiro.closing} ${roteiro.cta}.`,
    ];
    const { sceneSecs, narrationPath } = await narrateScenes(lines, {
      workDir,
      voiceStyle: VOICE_STYLE,
      pauseSec: PAUSE_AFTER_SCENE_SEC,
      holdAtEndSec: HOLD_AT_END_SEC,
    });
    const durationSec = sceneSecs.reduce((sum, value) => sum + value, 0);
    console.log(`duração: ${durationSec.toFixed(1)} s`);

    const round = (value: number) => Math.round(value * 100) / 100;
    const [hookSec, titleSec, lore1Sec, lore2Sec, gift1Sec, gift2Sec, gift3Sec, shadowSec, asksSec] = sceneSecs.map(round);
    const olhos = roteiro.olhos;
    console.log('renderizando');
    const silent = path.join(workDir, 'video.mp4');
    await renderComposition({
      templateSlug: 'mago-arquetipo',
      templateVersion: 1,
      params: {
        ...(roteiro.eyebrow ? { eyebrow: roteiro.eyebrow } : {}),
        ...(roteiro.signature ? { signature: roteiro.signature } : {}),
        ...(roteiro.accent ? { accent: roteiro.accent } : {}),
        hook: roteiro.hook,
        name: roteiro.name,
        epithet: roteiro.epithet,
        lore1Title: lore1.title,
        lore1Text: lore1.text,
        lore2Title: lore2.title,
        lore2Text: lore2.text,
        gift1Title: gift1.title,
        gift1Text: gift1.text,
        gift2Title: gift2.title,
        gift2Text: gift2.text,
        gift3Title: gift3.title,
        gift3Text: gift3.text,
        shadowTitle: roteiro.shadow.title,
        shadowText: roteiro.shadow.text,
        asks: roteiro.asks,
        closing: roteiro.closing,
        cta: roteiro.cta,
        hookSec, titleSec, lore1Sec, lore2Sec, gift1Sec, gift2Sec, gift3Sec, shadowSec, asksSec,
        artAspect: Math.round((artInfo.height / artInfo.width) * 1000) / 1000,
        eyeGlow: Boolean(olhos),
        ...(olhos ? { eyeLX: olhos.lx, eyeLY: olhos.ly, eyeRX: olhos.rx, eyeRY: olhos.ry } : {}),
        ...(olhos?.cor ? { eyeColor: olhos.cor } : {}),
      },
      width: 1080,
      height: 1920,
      durationSec,
      quality: 'final',
      workDir,
      outputPath: silent,
      files: { 'assets/arquetipo.png': art },
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
