import { z } from 'zod';
import { createLyricsProject, LYRICS_FORMATS } from '@editor-video/db/v3';
import { DEFAULT_LYRICS_PRESET, LYRICS_LIMITS, LYRICS_PRESET_IDS, LYRICS_PRESETS } from '@editor-video/domain';
import { body, ok, requireActor, v3 } from '@/lib/v3';

export const dynamic = 'force-dynamic';

const schema = z.object({
  channelId: z.string(),
  title: z.string().min(1).max(200),
  formats: z.array(z.enum(LYRICS_FORMATS)).min(1).max(2),
  audioAssetId: z.string(),
  lyrics: z
    .object({
      content: z.string().max(256 * 1024),
      fileName: z.string().max(255).nullable().optional(),
      format: z.enum(['txt', 'lrc', 'srt', 'vtt']).nullable().optional(),
    })
    .nullable()
    .optional(),
  /** Sem letra enviada: transcreve com Whisper local. */
  autoLyrics: z.boolean().optional(),
  language: z.string().min(2).max(16).nullable().optional(),
  presetId: z.enum(LYRICS_PRESET_IDS),
  segmentStartMs: z.number().int().min(0),
  segmentDurationMs: z.number().int().min(1000).max(600_000),
  credit: z.string().max(80).nullable().optional(),
  rights: z.object({ declared: z.boolean(), note: z.string().max(1000).nullable().optional() }),
});

/** Presets e limites para o formulário (o cliente não importa o domínio Node). */
export async function GET(): Promise<Response> {
  return v3(async () => {
    await requireActor();
    // Ordem de exibição: o Cinematic Atmospheric (preset principal) primeiro.
    return ok({ presets: LYRICS_PRESET_IDS.map((id) => LYRICS_PRESETS[id]), defaultPreset: DEFAULT_LYRICS_PRESET, limits: LYRICS_LIMITS, formats: LYRICS_FORMATS });
  });
}

/** Novo projeto Reactive Lyrics: música + letra → timeline com letra, composição e análise na fila. */
export async function POST(request: Request): Promise<Response> {
  return v3(async () => {
    const actor = await requireActor();
    return ok(await createLyricsProject(actor, schema.parse(await body(request))), 201);
  });
}
