import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { NextRequest } from 'next/server';
import { DomainError } from '@editor-video/domain';
import { listChannelMedia, uploadChannelMedia } from '@editor-video/db/v3';
import { ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return ok({ assets: await listChannelMedia(actor, id) });
  });
}

/** Upload por streaming (corpo bruto): POST …/media?name=arte.png */
export async function POST(request: NextRequest, { params }: Params): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    const { id } = await params;
    const name = request.nextUrl.searchParams.get('name');
    if (!name) throw new DomainError('INVALID', 'Informe ?name= com o nome do arquivo.');
    if (!request.body) throw new DomainError('INVALID', 'Corpo vazio.');
    const declared = request.headers.get('content-length');
    const asset = await uploadChannelMedia(actor, id, {
      originalName: path.basename(name),
      mimeType: request.headers.get('content-type'),
      stream: Readable.fromWeb(request.body as import('node:stream/web').ReadableStream),
      tmpDir: path.join(process.env.V3_UPLOAD_TMP ?? os.tmpdir(), 'editor-video-uploads'),
      declaredSize: declared ? BigInt(declared) : undefined,
    });
    return ok({ asset }, 201);
  });
}
