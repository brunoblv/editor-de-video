import path from 'node:path';
import type { Readable } from 'node:stream';
import type { NextRequest } from 'next/server';
import { getStorage } from '@editor-video/core';
import { requireStorageKeyAccess } from '@/lib/auth-guards';
import { ApiError, handle } from '@/lib/http';

export const dynamic = 'force-dynamic';

const CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
};

type Params = { params: Promise<{ key: string[] }> };

export async function GET(request: NextRequest, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { key: segments } = await params;
    const key = segments.map((segment) => decodeURIComponent(segment)).join('/');

    await requireStorageKeyAccess(key);

    const storage = getStorage();
    if (!(await storage.exists(key))) throw new ApiError('Arquivo não encontrado.', 404);

    const size = await storage.size(key);
    const contentType = CONTENT_TYPES[path.extname(key).toLowerCase()] ?? 'application/octet-stream';
    const download = request.nextUrl.searchParams.get('download') === '1';

    const headers = new Headers({
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=0, must-revalidate',
    });
    if (download) {
      headers.set('Content-Disposition', `attachment; filename="${path.basename(key)}"`);
    }

    // O <video> pede faixas parciais para poder buscar na timeline.
    const range = request.headers.get('range');
    const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;

    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;

      if (!Number.isFinite(start) || start >= size || start > end) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${size}` },
        });
      }

      const stream = await storage.createReadStream(key, { start, end });
      headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
      headers.set('Content-Length', String(end - start + 1));
      return new Response(toWebStream(stream), { status: 206, headers });
    }

    headers.set('Content-Length', String(size));
    return new Response(toWebStream(await storage.createReadStream(key)), { status: 200, headers });
  });
}

function toWebStream(stream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      stream.on('end', () => controller.close());
      stream.on('error', (err) => controller.error(err));
    },
    cancel() {
      stream.destroy();
    },
  });
}
