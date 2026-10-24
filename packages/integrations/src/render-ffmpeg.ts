/**
 * Executor FFmpeg do plano de render (compile.ts). Prévia e final usam esta
 * mesma função; só mudam resolução, bitrate e proxies (§8).
 *
 * Construção:
 * - cada camada de vídeo é uma entrada com -ss/-t (sem decodificar a fonte
 *   inteira), transformada (crop → escala fit/fill → opacidade) e sobreposta
 *   numa base preta na janela [start, end);
 * - textos e legendas viram um arquivo ASS renderizado por libass;
 * - áudio: atempo/volume/fades/pan/atraso por item e mixagem sem normalizar;
 * - normalização de loudness por perfil do canal (fala ≠ ambient).
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { PlannedText, RenderPlan } from '@editor-video/timeline/compile';
import { runProcess, toolPaths, type ToolPaths } from './process.js';

export type AssetResolver = (assetId: string, useProxy: boolean) => Promise<{ path: string; kind: string }>;
export type CompositionResolver = (layerItemId: string) => Promise<string>;

export type RenderOptions = {
  plan: RenderPlan;
  outputPath: string;
  /** Diretório temporário desta tentativa (removido pelo chamador em falha/cancelamento). */
  workDir: string;
  resolveAsset: AssetResolver;
  resolveComposition?: CompositionResolver;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
  paths?: ToolPaths;
};

const LOUDNESS: Record<RenderPlan['output']['loudnessProfile'], string | null> = {
  speech: 'loudnorm=I=-16:TP=-1.5:LRA=11',
  music: 'loudnorm=I=-14:TP=-1:LRA=11',
  // Ambient: alvo mais baixo e LRA alta, sem achatar a dinâmica.
  ambient: 'loudnorm=I=-24:TP=-2:LRA=20',
  none: null,
};

const n = (v: number) => (Math.round(v * 1_000_000) / 1_000_000).toString();

/** Cor CSS #RRGGBB → ASS &HAABBGGRR. */
function assColor(hex: string | null | undefined, alpha = 0): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '');
  const [r, g, b] = m ? [m[1], m[2], m[3]] : ['FF', 'FF', 'FF'];
  return `&H${alpha.toString(16).padStart(2, '0').toUpperCase()}${b}${g}${r}`.toUpperCase();
}

function assTime(sec: number): string {
  const cs = Math.max(0, Math.round(sec * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

function assEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\r?\n/g, '\\N');
}

/** Gera o ASS de textos e legendas, posicionados por estilo e área segura. */
export function buildAss(texts: PlannedText[], width: number, height: number, scale: number): string {
  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Inter,64,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,2,60,60,60,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  for (const t of texts) {
    const style = t.style;
    const safe = (style.safeArea ?? 0.06) * width;
    const align = style.align ?? 'center';
    const an = align === 'left' ? 1 : align === 'right' ? 3 : 2;
    const x = align === 'left' ? safe : align === 'right' ? width - safe : width / 2;
    const minY = (style.safeArea ?? 0.06) * height;
    const y = Math.min(height - minY, Math.max(minY, (style.positionY ?? (t.kind === 'caption' ? 0.85 : 0.5)) * height));
    const size = Math.round((style.fontSize ?? (t.kind === 'caption' ? 56 : 72)) * scale);
    const bold = (style.fontWeight ?? 700) >= 600 ? 1 : 0;
    const box = style.background ? `\\3c${assColor(style.background)}\\bord${Math.round(12 * scale)}` : `\\bord${Math.max(1, Math.round(3 * scale))}`;
    const overrides = `{\\an${an}\\pos(${Math.round(x)},${Math.round(y)})\\fn${style.fontFamily ?? 'Inter'}\\fs${size}\\b${bold}\\1c${assColor(style.color)}${box}}`;
    const layer = t.kind === 'caption' ? 1 : 0;
    lines.push(`Dialogue: ${layer},${assTime(t.startSec)},${assTime(t.endSec)},Default,,0,0,0,,${overrides}${assEscape(t.text)}`);
  }
  return `${lines.join('\n')}\n`;
}

function atempoChain(speed: number): string[] {
  const filters: string[] = [];
  let remaining = speed;
  while (remaining > 2) {
    filters.push('atempo=2');
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  if (Math.abs(remaining - 1) > 1e-6) filters.push(`atempo=${n(remaining)}`);
  return filters;
}

export type BuiltCommand = { args: string[]; assFile: string | null };

/** Monta argumentos do FFmpeg (exportado para testes e diagnóstico). */
export async function buildRenderCommand(options: RenderOptions): Promise<BuiltCommand> {
  const { plan } = options;
  const W = plan.width;
  const H = plan.height;
  const fps = `${plan.fps.num}/${plan.fps.den}`;
  const duration = plan.durationSec;
  const inputs: string[] = [];
  const filters: string[] = [];
  let inputIndex = 0;
  const videoInputByItem = new Map<string, number>();

  filters.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${n(Math.max(duration, 1 / 30))},format=yuv420p[base0]`);
  let current = 'base0';

  const layers = [...plan.video].sort((a, b) => a.trackOrder - b.trackOrder || a.startSec - b.startSec);
  for (const [li, layer] of layers.entries()) {
    const length = layer.endSec - layer.startSec;
    let file: string;
    let isStill = false;
    if (layer.kind === 'composition') {
      if (!options.resolveComposition) throw new Error(`Composição ${layer.itemId} sem resolvedor`);
      file = await options.resolveComposition(layer.itemId);
      inputs.push('-t', n(length), '-i', file);
    } else {
      const asset = await options.resolveAsset(layer.assetId!, layer.useProxy);
      file = asset.path;
      isStill = asset.kind === 'image';
      if (isStill) {
        inputs.push('-loop', '1', '-framerate', fps, '-t', n(length), '-i', file);
      } else {
        const srcLen = (layer.sourceOutSec ?? 0) - (layer.sourceInSec ?? 0);
        inputs.push('-ss', n(layer.sourceInSec ?? 0), '-t', n(srcLen), '-i', file);
      }
    }
    const idx = inputIndex++;
    videoInputByItem.set(layer.itemId, idx);

    const t = layer.transform;
    const chain: string[] = [];
    chain.push(isStill || layer.speed === 1 ? 'setpts=PTS-STARTPTS' : `setpts=(PTS-STARTPTS)/${n(layer.speed)}`);
    if (t.crop) {
      chain.push(`crop=w=iw*${n(t.crop.width)}:h=ih*${n(t.crop.height)}:x=iw*${n(t.crop.x)}:y=ih*${n(t.crop.y)}`);
    }
    const boxW = Math.max(2, Math.round((W * t.scale) / 2) * 2);
    const boxH = Math.max(2, Math.round((H * t.scale) / 2) * 2);
    if (t.fit === 'fill') {
      chain.push(`scale=${boxW}:${boxH}:force_original_aspect_ratio=increase`, `crop=${boxW}:${boxH}`);
    } else {
      // Nunca estica: cabe inteiro na caixa, mantendo proporção.
      chain.push(`scale=${boxW}:${boxH}:force_original_aspect_ratio=decrease`, 'pad=ceil(iw/2)*2:ceil(ih/2)*2');
    }
    chain.push('setsar=1', `fps=${fps}`, 'format=yuva420p');
    if (t.rotation !== 0) chain.push(`rotate=${n((t.rotation * Math.PI) / 180)}:c=none:ow=rotw(${n((t.rotation * Math.PI) / 180)}):oh=roth(${n((t.rotation * Math.PI) / 180)})`);
    if (t.opacity < 1) chain.push(`colorchannelmixer=aa=${n(t.opacity)}`);
    chain.push(`trim=duration=${n(length)}`, `setpts=PTS+${n(layer.startSec)}/TB`);
    filters.push(`[${idx}:v]${chain.join(',')}[l${li}]`);

    const x = `${n(t.positionX)}*W-w/2`;
    const y = `${n(t.positionY)}*H-h/2`;
    const next = `v${li}`;
    filters.push(
      `[${current}][l${li}]overlay=x='${x}':y='${y}':enable='between(t,${n(layer.startSec)},${n(layer.endSec)})':eof_action=pass:format=auto[${next}]`,
    );
    current = next;
  }

  let assFile: string | null = null;
  if (plan.text.length > 0) {
    assFile = path.join(options.workDir, 'texts.ass');
    await fsp.mkdir(options.workDir, { recursive: true });
    await fsp.writeFile(assFile, buildAss(plan.text, W, H, plan.renderScale), 'utf8');
    // Executamos com cwd=workDir: nome relativo evita escapar caminhos Windows no filtro.
    filters.push(`[${current}]ass=texts.ass,format=yuv420p[vout]`);
  } else {
    filters.push(`[${current}]format=yuv420p[vout]`);
  }

  const audioLabels: string[] = [];
  for (const [ai, a] of plan.audio.entries()) {
    let idx = videoInputByItem.get(a.itemId);
    if (idx === undefined) {
      const asset = await options.resolveAsset(a.assetId, a.useProxy);
      inputs.push('-ss', n(a.sourceInSec), '-t', n(a.sourceOutSec - a.sourceInSec), '-i', asset.path);
      idx = inputIndex++;
    }
    const length = a.endSec - a.startSec;
    const chain = ['asetpts=PTS-STARTPTS', 'aresample=48000', 'aformat=channel_layouts=stereo', ...atempoChain(a.speed)];
    chain.push(`atrim=duration=${n(length)}`);
    if (a.gainDb !== 0) chain.push(`volume=${n(a.gainDb)}dB`);
    if (a.fadeInSec > 0) chain.push(`afade=t=in:st=0:d=${n(a.fadeInSec)}`);
    if (a.fadeOutSec > 0) chain.push(`afade=t=out:st=${n(Math.max(0, length - a.fadeOutSec))}:d=${n(a.fadeOutSec)}`);
    if (a.pan !== 0) chain.push(`stereotools=balance_out=${n(a.pan)}`);
    const delayMs = Math.round(a.startSec * 1000);
    if (delayMs > 0) chain.push(`adelay=${delayMs}:all=1`);
    filters.push(`[${idx}:a]${chain.join(',')}[a${ai}]`);
    audioLabels.push(`[a${ai}]`);
  }
  const loudness = LOUDNESS[plan.output.loudnessProfile];
  if (audioLabels.length > 0) {
    const mix =
      audioLabels.length > 1
        ? `${audioLabels.join('')}amix=inputs=${audioLabels.length}:normalize=0:duration=longest,`
        : audioLabels[0]!;
    const tail = ['apad', `atrim=duration=${n(duration)}`, ...(loudness ? [loudness] : []), 'aresample=48000'].join(',');
    filters.push(`${mix}${tail}[aout]`);
  } else {
    filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${n(duration)}[aout]`);
  }

  const final = plan.quality === 'final';
  const args = [
    '-y',
    '-hide_banner',
    '-v', 'error',
    '-progress', 'pipe:1',
    '-nostats',
    ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', '[vout]',
    '-map', '[aout]',
    '-c:v', 'libx264',
    '-preset', final ? 'medium' : 'veryfast',
    '-crf', final ? '18' : '28',
    '-pix_fmt', 'yuv420p',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-r', fps,
    '-c:a', 'aac',
    '-b:a', final ? '192k' : '128k',
    '-ar', '48000',
    '-t', n(duration),
    '-movflags', '+faststart',
    options.outputPath,
  ];
  return { args, assFile };
}

/** Renderiza o plano para MP4, escrevendo em .part e renomeando ao concluir. */
export async function renderPlanWithFfmpeg(options: RenderOptions): Promise<{ outputPath: string; ffmpegArgs: string[] }> {
  const paths = options.paths ?? toolPaths();
  await fsp.mkdir(options.workDir, { recursive: true });
  await fsp.mkdir(path.dirname(options.outputPath), { recursive: true });
  const partPath = `${options.outputPath}.part.mp4`;
  const { args } = await buildRenderCommand({ ...options, outputPath: path.resolve(partPath) });
  const durationUs = options.plan.durationSec * 1_000_000;
  try {
    await runProcess(paths.ffmpeg, args, {
      cwd: options.workDir,
      signal: options.signal,
      onStdout: (chunk) => {
        const m = /out_time_us=(\d+)/g;
        let match: RegExpExecArray | null;
        let last: number | null = null;
        while ((match = m.exec(chunk))) last = Number(match[1]);
        if (last !== null && durationUs > 0) options.onProgress?.(Math.min(1, last / durationUs));
      },
    });
    await fsp.rename(partPath, options.outputPath);
    options.onProgress?.(1);
    return { outputPath: options.outputPath, ffmpegArgs: args };
  } catch (err) {
    await fsp.rm(partPath, { force: true });
    throw err;
  }
}
