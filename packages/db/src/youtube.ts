import { config } from '@editor-video/core/config';
import { MIDNIGHT_PLAYLISTS, type MidnightPlaylistKey } from '@editor-video/core/midnight';
import { prisma } from './client.js';

const YT_AUTH = 'https://oauth2.googleapis.com';
const YT_API = 'https://www.googleapis.com/youtube/v3';
const YT_UPLOAD = 'https://www.googleapis.com/upload/youtube/v3';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.force-ssl',
].join(' ');

export function youtubeConfigured(): boolean {
  return Boolean(config.youtube.clientId && config.youtube.clientSecret);
}

export function getYoutubeAuthUrl(state: string): string {
  if (!youtubeConfigured()) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET não configurados.');
  }
  const params = new URLSearchParams({
    client_id: config.youtube.clientId,
    redirect_uri: config.youtube.redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}> {
  const res = await fetch(`${YT_AUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.youtube.clientId,
      client_secret: config.youtube.clientSecret,
      redirect_uri: config.youtube.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Falha no OAuth YouTube.');
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in ?? 3600,
    scope: data.scope,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const res = await fetch(`${YT_AUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.youtube.clientId,
      client_secret: config.youtube.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Falha ao renovar token YouTube.');
  }
  return { access_token: data.access_token, expires_in: data.expires_in ?? 3600 };
}

export async function getValidAccessToken(userId: string): Promise<string> {
  const channel = await prisma.youTubeChannel.findUnique({ where: { userId } });
  if (!channel) throw new Error('Canal YouTube não conectado.');

  const expiresAt = channel.expiresAt?.getTime() ?? 0;
  if (expiresAt > Date.now() + 60_000) {
    return channel.accessToken;
  }

  const refreshed = await refreshAccessToken(channel.refreshToken);
  await prisma.youTubeChannel.update({
    where: { id: channel.id },
    data: {
      accessToken: refreshed.access_token,
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
    },
  });
  return refreshed.access_token;
}

export async function fetchMyChannel(accessToken: string): Promise<{
  id: string;
  title: string;
}> {
  const url = `${YT_API}/channels?part=snippet&mine=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json()) as {
    items?: Array<{ id: string; snippet?: { title?: string } }>;
    error?: { message?: string };
  };
  if (!res.ok || !data.items?.[0]) {
    throw new Error(data.error?.message || 'Não foi possível ler o canal YouTube.');
  }
  return {
    id: data.items[0].id,
    title: data.items[0].snippet?.title ?? 'YouTube Channel',
  };
}

async function listPlaylists(accessToken: string): Promise<Array<{ id: string; title: string }>> {
  const items: Array<{ id: string; title: string }> = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      part: 'snippet',
      mine: 'true',
      maxResults: '50',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`${YT_API}/playlists?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await res.json()) as {
      items?: Array<{ id: string; snippet?: { title?: string } }>;
      nextPageToken?: string;
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(data.error?.message || 'Falha ao listar playlists.');
    for (const item of data.items ?? []) {
      items.push({ id: item.id, title: item.snippet?.title ?? '' });
    }
    pageToken = data.nextPageToken ?? '';
  } while (pageToken);
  return items;
}

async function createPlaylist(
  accessToken: string,
  title: string,
  description: string,
): Promise<string> {
  const res = await fetch(`${YT_API}/playlists?part=snippet,status`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      snippet: { title, description },
      status: { privacyStatus: 'public' },
    }),
  });
  const data = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !data.id) {
    throw new Error(data.error?.message || `Falha ao criar playlist ${title}.`);
  }
  return data.id;
}

/** Garante as 7 playlists Midnight e devolve o mapa key → playlistId. */
export async function ensureMidnightPlaylists(
  accessToken: string,
): Promise<Record<MidnightPlaylistKey, string>> {
  const existing = await listPlaylists(accessToken);
  const map = {} as Record<MidnightPlaylistKey, string>;

  for (const pl of MIDNIGHT_PLAYLISTS) {
    const found = existing.find(
      (e) => e.title === pl.title || e.title.toLowerCase().includes(pl.key.replace(/_/g, ' ')),
    );
    if (found) {
      map[pl.key] = found.id;
    } else {
      map[pl.key] = await createPlaylist(accessToken, pl.title, pl.description);
    }
  }
  return map;
}

export async function uploadVideoResumable(opts: {
  accessToken: string;
  file: Buffer;
  mimeType?: string;
  title: string;
  description: string;
  tags: string[];
  categoryId?: string;
  privacyStatus?: 'private' | 'unlisted' | 'public';
  publishAt?: string;
}): Promise<string> {
  const metaRes = await fetch(
    `${YT_UPLOAD}/videos?uploadType=resumable&part=snippet,status`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(opts.file.byteLength),
        'X-Upload-Content-Type': opts.mimeType ?? 'video/mp4',
      },
      body: JSON.stringify({
        snippet: {
          title: opts.title.slice(0, 100),
          description: opts.description.slice(0, 5000),
          tags: opts.tags.slice(0, 40),
          categoryId: opts.categoryId ?? '10',
        },
        status: {
          // publishAt exige privacyStatus "private" — o YouTube torna público sozinho na hora certa.
          privacyStatus: opts.publishAt ? 'private' : (opts.privacyStatus ?? 'private'),
          ...(opts.publishAt ? { publishAt: opts.publishAt } : {}),
          selfDeclaredMadeForKids: false,
        },
      }),
    },
  );

  if (!metaRes.ok) {
    const err = (await metaRes.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err.error?.message || 'Falha ao iniciar upload YouTube.');
  }

  const uploadUrl = metaRes.headers.get('location');
  if (!uploadUrl) throw new Error('YouTube não retornou URL de upload.');

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'Content-Type': opts.mimeType ?? 'video/mp4',
      'Content-Length': String(opts.file.byteLength),
    },
    body: new Uint8Array(opts.file),
  });

  const data = (await putRes.json()) as { id?: string; error?: { message?: string } };
  if (!putRes.ok || !data.id) {
    throw new Error(data.error?.message || 'Falha no upload do vídeo.');
  }
  return data.id;
}

export async function setThumbnail(
  accessToken: string,
  videoId: string,
  jpeg: Buffer,
): Promise<void> {
  const res = await fetch(
    `${YT_UPLOAD}/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'image/jpeg',
      },
      body: new Uint8Array(jpeg),
    },
  );
  if (!res.ok) {
    // Thumbnail customizada exige canal verificado — não bloqueia publish.
    console.warn('Falha ao enviar thumbnail YouTube (pode exigir verificação).');
  }
}

export async function addToPlaylist(
  accessToken: string,
  playlistId: string,
  videoId: string,
): Promise<void> {
  const res = await fetch(`${YT_API}/playlistItems?part=snippet`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      snippet: {
        playlistId,
        resourceId: { kind: 'youtube#video', videoId },
      },
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data.error?.message || 'Falha ao adicionar à playlist.');
  }
}
