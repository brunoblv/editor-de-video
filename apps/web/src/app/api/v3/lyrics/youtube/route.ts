import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { importYoutubeLyricsAudio } from '@editor-video/db/v3';
import { DomainError } from '@editor-video/domain';
import { searchYoutube } from '@editor-video/integrations';
import { body, ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Busca no YouTube (yt-dlp, sem chave de API): GET ?q=texto */
export async function GET(request: NextRequest): Promise<Response> {
  return v3(async () => {
    await requireActor();
    const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
    if (q.length < 2) throw new DomainError('INVALID', 'Digite pelo menos 2 caracteres.');
    try {
      return ok({ results: await searchYoutube(q, { limit: 12 }) });
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'ENOENT') throw new DomainError('DEPENDENCY_MISSING', 'yt-dlp não encontrado. Instale-o ou defina YTDLP_BIN.');
      throw new DomainError('TRANSIENT', `Busca no YouTube falhou: ${e.message.slice(-200)}`);
    }
  });
}

const schema = z.object({
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  rights: z.object({ declared: z.boolean(), note: z.string().max(1000).nullable().optional() }),
});

/** Baixa o áudio do vídeo escolhido e registra como asset (exige declaração de direitos). */
export async function POST(request: Request): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    return ok(await importYoutubeLyricsAudio(actor, schema.parse(await body(request))), 201);
  });
}
