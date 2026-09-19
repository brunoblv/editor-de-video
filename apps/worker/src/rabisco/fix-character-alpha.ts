import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoRoot } from '@editor-video/core';
import sharp from 'sharp';

/**
 * Corrige assets do Rabisco gerados por IA que "desenharam" o quadriculado de
 * transparência como pixels RGB opacos em vez de emitir alpha real — e
 * recentraliza o personagem no canvas.
 *
 * Uso: npm run rabisco:fix-alpha [-- arquivo1.png arquivo2.png ...]
 * Sem argumentos, roda contra todos os PNGs em
 * apps/web/public/characters/rabisco/actions/.
 *
 * Classificação por tom de cinza, sem conectividade: uma primeira versão deste
 * script usava flood-fill a partir da borda do canvas (só vira transparente o
 * que está "conectado" ao fundo), pensando em evitar apagar por engano algum
 * tom de cinza que aparecesse *dentro* do personagem. Na prática essa arte é
 * só traço de tinta sobre fundo transparente — não tem preenchimento colorido
 * nem sombreado interno — então não existe esse risco, e a conectividade
 * criava um bug bem pior: qualquer área vazada *cercada* pelo próprio traço
 * (o interior do círculo da cabeça, o vão entre pernas cruzadas) nunca é
 * alcançada a partir da borda, então ficava errdo mente sólida/opaca em vez de
 * transparente. A classificação por tom evita isso: um pixel é fundo se o tom
 * de cinza dele é claro o bastante, não importa onde esteja na imagem.
 */

/** Abaixo disso: tinta (opaco). Acima: fundo (transparente). Entre os dois: rampa suave. */
const INK_CUTOFF = 65;
const BG_CUTOFF = 105;

async function fixFile(file: string): Promise<void> {
  const img = sharp(file);
  const { data, info } = await img.raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // Placeholder 1x1 transparente — nada pra corrigir.
  if (width * height <= 4) {
    console.log(`ignorado (placeholder): ${path.relative(repoRoot, file)}`);
    return;
  }

  const n = width * height;
  const rgba = Buffer.alloc(n * 4);

  for (let i = 0; i < n; i++) {
    const idx = i * channels;
    const r = data[idx]!;
    const g = data[idx + 1]!;
    const b = data[idx + 2]!;
    const grayscale = Math.abs(r - g) <= 6 && Math.abs(g - b) <= 6 && Math.abs(r - b) <= 6;
    const value = (r + g + b) / 3;

    let alpha: number;
    if (!grayscale) {
      alpha = 255; // essa arte não tem cor — qualquer pixel colorido é conteúdo real, preserva.
    } else if (value <= INK_CUTOFF) {
      alpha = 255;
    } else if (value >= BG_CUTOFF) {
      alpha = 0;
    } else {
      alpha = Math.round((255 * (BG_CUTOFF - value)) / (BG_CUTOFF - INK_CUTOFF));
    }

    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    // Never make an already transparent pixel opaque again on repeated runs.
    rgba[i * 4 + 3] = Math.min(data[idx + 3]!, alpha);
  }

  // Bounding box do conteúdo opaco, calculado direto do alpha (não usar sharp .trim() —
  // seu critério de similaridade ao pixel do canto não é confiável para PNGs com alpha).
  const ALPHA_BBOX_THRESHOLD = 100;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3]! <= ALPHA_BBOX_THRESHOLD) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) {
    throw new Error(`${file}: nenhum pixel opaco encontrado após a correção de alpha.`);
  }

  const tw = maxX - minX + 1;
  const th = maxY - minY + 1;

  const cropped = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract({ left: minX, top: minY, width: tw, height: th })
    .png()
    .toBuffer();

  await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: cropped,
        left: Math.round((width - tw) / 2),
        top: Math.round((height - th) / 2),
      },
    ])
    .png()
    .toFile(file);

  console.log(`corrigido: ${path.relative(repoRoot, file)} (conteúdo ${tw}x${th} recentralizado em ${width}x${height})`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let files = args;
  if (files.length === 0) {
    const dir = path.join(repoRoot, 'apps', 'web', 'public', 'characters', 'rabisco', 'actions');
    const entries = await fsp.readdir(dir);
    files = entries.filter((name) => name.endsWith('.png')).map((name) => path.join(dir, name));
  }

  for (const file of files) {
    await fixFile(path.isAbsolute(file) ? file : path.resolve(process.cwd(), file));
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
