import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { ensureBrowser, renderMedia, selectComposition } from '@remotion/renderer';
import {
  config,
  repoRoot,
  type ChristianProps,
  type CuriosidadeProps,
  type RabiscoProps,
  type TopListProps,
} from '@editor-video/core';
import { logger } from './logger.js';

const log = logger('render');

const ENTRY_POINT = path.join(repoRoot, 'packages', 'video', 'src', 'index.ts');
const TOP_LIST_ID = 'TopList';
const CURIOSIDADE_ID = 'Curiosidade';
const CHRISTIAN_ID = 'Christian';
const RABISCO_ID = 'Rabisco';

let bundlePromise: Promise<string> | null = null;

/** O bundle do Remotion é caro; reaproveitamos entre jobs no mesmo processo. */
function getServeUrl(): Promise<string> {
  if (!bundlePromise) {
    log.info('Empacotando composições Remotion...');
    bundlePromise = bundle({
      entryPoint: ENTRY_POINT,
      onProgress: (percent) => {
        if (percent % 25 === 0) log.info(`bundle ${percent}%`);
      },
    })
      .then((url) => {
        log.info('Bundle pronto.');
        return url;
      })
      .catch((err: unknown) => {
        // Sem isso a promise rejeitada ficaria em cache e todo render seguinte
        // falharia com o mesmo erro, mesmo depois de corrigido.
        bundlePromise = null;
        throw err;
      });
  }
  return bundlePromise;
}

async function renderComposition(
  compositionId: string,
  props: Record<string, unknown>,
  outputPath: string,
  onProgress?: (ratio: number) => void,
): Promise<void> {
  await ensureBrowser();
  const serveUrl = await getServeUrl();

  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps: props,
  });

  await renderMedia({
    composition: {
      ...composition,
      width: config.video.width,
      height: config.video.height,
      fps: config.video.fps,
    },
    serveUrl,
    codec: 'h264',
    pixelFormat: 'yuv420p',
    colorSpace: 'bt709',
    outputLocation: outputPath,
    inputProps: props,
    concurrency: null,
    onProgress: ({ progress }) => onProgress?.(progress),
  });
}

export interface RenderOptions {
  props: TopListProps;
  outputPath: string;
  onProgress?: (ratio: number) => void;
}

export async function renderTopList(opts: RenderOptions): Promise<void> {
  await renderComposition(TOP_LIST_ID, opts.props, opts.outputPath, opts.onProgress);
}

export async function renderCuriosidade(opts: {
  props: CuriosidadeProps;
  outputPath: string;
  onProgress?: (ratio: number) => void;
}): Promise<void> {
  await renderComposition(CURIOSIDADE_ID, opts.props, opts.outputPath, opts.onProgress);
}

export async function renderChristian(opts: {
  props: ChristianProps;
  outputPath: string;
  onProgress?: (ratio: number) => void;
}): Promise<void> {
  await renderComposition(CHRISTIAN_ID, opts.props, opts.outputPath, opts.onProgress);
}

export async function renderRabisco(opts: {
  props: RabiscoProps;
  outputPath: string;
  onProgress?: (ratio: number) => void;
}): Promise<void> {
  await renderComposition(RABISCO_ID, opts.props, opts.outputPath, opts.onProgress);
}
