import { HubApiError } from '@/components/hub/api';

export type MediaAsset = {
  id: string;
  kind: string;
  status: string;
  originalName: string;
  storageKey: string;
  width: number | null;
  height: number | null;
  durationSec: number | null;
};

export type SocialPost = {
  id: string;
  channelId: string;
  title: string | null;
  caption: string;
  notes: string | null;
  state: 'DRAFT' | 'SCHEDULED' | 'POSTED' | 'CANCELLED';
  scheduledAt: string | null;
  postedAt: string | null;
  media: Array<{ asset: MediaAsset }>;
  targets: Array<{ platform: Platform; postedAt: string | null; remoteUrl: string | null }>;
};

export const PLATFORMS = { INSTAGRAM: 'Instagram', TIKTOK: 'TikTok', YOUTUBE: 'YouTube', FACEBOOK: 'Facebook' } as const;
export type Platform = keyof typeof PLATFORMS;

// Mesmo fuso do Calendário: o Brasil não tem horário de verão desde 2019.
const TZ = 'America/Sao_Paulo';
const OFFSET = '-03:00';

/** AAAA-MM-DD no fuso do hub. */
export const dayKey = (value: Date | string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
export const hourLabel = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const dayStartIso = (key: string) => new Date(`${key}T00:00:00${OFFSET}`).toISOString();
export const inputToIso = (value: string) => new Date(`${value}:00${OFFSET}`).toISOString();
/** ISO → valor de <input type="datetime-local"> no fuso do hub. */
export const isoToInput = (iso: string) => `${dayKey(iso)}T${hourLabel(iso)}`;

export const fileUrl = (asset: Pick<MediaAsset, 'storageKey'>) => `/api/files/${asset.storageKey.split('/').map(encodeURIComponent).join('/')}`;

export const postLabel = (post: Pick<SocialPost, 'title' | 'caption' | 'media'>) => post.title || post.caption.split('\n')[0]?.trim() || post.media[0]?.asset.originalName || 'Post sem texto';

export const errorText = (err: unknown) => (err as Error)?.message ?? 'Erro inesperado.';

export async function uploadToChannel(channelId: string, file: File): Promise<void> {
  const res = await fetch(`/api/v3/channels/${channelId}/media?name=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    body: file,
    headers: { 'content-type': file.type || 'application/octet-stream' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HubApiError(data.error ?? `Erro ${res.status}`, res.status, data.code ?? 'INTERNAL', data);
}
