import fsp from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { config } from '@editor-video/core';

/** Baixa URL para arquivo local, com teto de tamanho. */
export async function downloadFile(url: string, destPath: string): Promise<void> {
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download falhou (${response.status}) para ${url}`);
  }

  const maxBytes = config.ambient.maxDownloadBytes;
  const contentLength = Number(response.headers.get('content-length') ?? NaN);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(
      `Download bloqueado: arquivo com ${(contentLength / 1024 / 1024).toFixed(1)} MB excede o limite de ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`,
    );
  }

  let downloaded = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, callback) {
      downloaded += chunk.length;
      if (downloaded > maxBytes) {
        callback(
          new Error(
            `Download abortado: excedeu ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`,
          ),
        );
        return;
      }
      callback(null, chunk);
    },
  });

  const nodeStream = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
  await pipeline(nodeStream, limiter, createWriteStream(destPath));
}
