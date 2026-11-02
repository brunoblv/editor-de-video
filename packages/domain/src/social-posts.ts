/**
 * Posts da agenda do canal: conteúdo editado no hub e regras mínimas de cada
 * rede, conferidas ao agendar. Rascunho pode ficar incompleto.
 */
import { z } from 'zod';

export const SOCIAL_PLATFORMS = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'FACEBOOK'] as const;
export type SocialPlatformName = (typeof SOCIAL_PLATFORMS)[number];

export const PLATFORM_RULES: Record<SocialPlatformName, { label: string; maxCaption: number }> = {
  INSTAGRAM: { label: 'Instagram', maxCaption: 2200 },
  TIKTOK: { label: 'TikTok', maxCaption: 2200 },
  YOUTUBE: { label: 'YouTube', maxCaption: 5000 },
  FACEBOOK: { label: 'Facebook', maxCaption: 63206 },
};

const YOUTUBE_MAX_TITLE = 100;

export const socialPostInputSchema = z.object({
  title: z.string().trim().max(200).nullable().default(null),
  caption: z.string().max(PLATFORM_RULES.FACEBOOK.maxCaption).default(''),
  notes: z.string().max(2000).nullable().default(null),
  platforms: z.array(z.enum(SOCIAL_PLATFORMS)).max(SOCIAL_PLATFORMS.length).default([]).transform((p) => [...new Set(p)]),
  /** Ordem do array = ordem da mídia no post. */
  assetIds: z.array(z.string()).max(35).default([]).transform((a) => [...new Set(a)]),
});

export type SocialPostInput = z.infer<typeof socialPostInputSchema>;

export type SocialPostDraft = {
  title: string | null;
  caption: string;
  platforms: readonly SocialPlatformName[];
  mediaKinds: readonly string[];
};

/** Motivos que impedem agendar. Vazio = pode entrar na agenda. */
export function socialPostIssues(post: SocialPostDraft): string[] {
  const issues: string[] = [];
  if (post.platforms.length === 0) issues.push('Escolha ao menos uma rede.');
  const videos = post.mediaKinds.filter((k) => k === 'VIDEO').length;
  const images = post.mediaKinds.length - videos;
  for (const platform of post.platforms) {
    const { label, maxCaption } = PLATFORM_RULES[platform];
    if (post.caption.length > maxCaption) issues.push(`${label}: legenda com ${post.caption.length} caracteres (máximo ${maxCaption}).`);
    if ((platform === 'INSTAGRAM' || platform === 'TIKTOK') && post.mediaKinds.length === 0) issues.push(`${label}: o post precisa de mídia.`);
    if (platform === 'TIKTOK' && videos > 0 && (videos > 1 || images > 0)) issues.push('TikTok: use um único vídeo ou apenas imagens.');
    if (platform === 'YOUTUBE') {
      if (videos !== 1 || images > 0) issues.push('YouTube: o post precisa de exatamente um vídeo, sem imagens.');
      if (!post.title) issues.push('YouTube: informe o título.');
      else if (post.title.length > YOUTUBE_MAX_TITLE) issues.push(`YouTube: título com ${post.title.length} caracteres (máximo ${YOUTUBE_MAX_TITLE}).`);
    }
  }
  if (post.platforms.length > 0 && !post.caption.trim() && post.mediaKinds.length === 0) issues.push('O post está vazio.');
  return issues;
}
