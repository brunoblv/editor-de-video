import fsp from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

/** Baixa URL para arquivo local. */
export async function downloadFile(url: string, destPath: string): Promise<void> {
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download falhou (${response.status}) para ${url}`);
  }

  const nodeStream = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
  await pipeline(nodeStream, createWriteStream(destPath));
}
