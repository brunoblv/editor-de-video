import { config } from '@editor-video/core';

export type StockHit = {
  provider: 'pexels' | 'pixabay';
  sourceUrl: string;
  downloadUrl: string;
  author: string | null;
  license: string;
  width: number;
  height: number;
  durationSec: number;
  score: number;
};

function scoreVideo(opts: {
  width: number;
  height: number;
  durationSec: number;
}): number {
  let score = 50;
  const { width, height, durationSec } = opts;
  if (height >= width) score += 25;
  else if (width > 0) score += 5;
  if (height >= 1080 || width >= 1080) score += 15;
  else if (height >= 720 || width >= 720) score += 8;
  if (durationSec >= 4 && durationSec <= 30) score += 10;
  else if (durationSec > 30) score += 4;
  return Math.min(100, score);
}

async function searchPexels(query: string): Promise<StockHit[]> {
  const key = config.media.pexelsApiKey;
  if (!key) return [];

  const url = new URL('https://api.pexels.com/videos/search');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', '8');
  url.searchParams.set('orientation', 'portrait');

  const response = await fetch(url, { headers: { Authorization: key } });
  if (!response.ok) {
    throw new Error(`Pexels falhou (${response.status}). Verifique PEXELS_API_KEY.`);
  }

  const data = (await response.json()) as {
    videos?: Array<{
      duration?: number;
      user?: { name?: string };
      video_files?: Array<{
        link?: string;
        width?: number;
        height?: number;
        file_type?: string;
      }>;
      url?: string;
    }>;
  };

  const hits: StockHit[] = [];
  for (const video of data.videos ?? []) {
    const files = [...(video.video_files ?? [])]
      .filter((f) => f.link && (f.width ?? 0) > 0)
      .sort((a, b) => (b.height ?? 0) * (b.width ?? 0) - (a.height ?? 0) * (a.width ?? 0));
    const best = files[0];
    if (!best?.link) continue;
    const width = best.width ?? 0;
    const height = best.height ?? 0;
    const durationSec = Number(video.duration ?? 0);
    hits.push({
      provider: 'pexels',
      sourceUrl: video.url ?? best.link,
      downloadUrl: best.link,
      author: video.user?.name ?? null,
      license: 'Pexels License',
      width,
      height,
      durationSec,
      score: scoreVideo({ width, height, durationSec }),
    });
  }
  return hits;
}

async function searchPixabay(query: string): Promise<StockHit[]> {
  const key = config.media.pixabayApiKey;
  if (!key) return [];

  const url = new URL('https://pixabay.com/api/videos/');
  url.searchParams.set('key', key);
  url.searchParams.set('q', query);
  url.searchParams.set('per_page', '10');
  url.searchParams.set('safesearch', 'true');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Pixabay falhou (${response.status}). Verifique PIXABAY_API_KEY.`);
  }

  const data = (await response.json()) as {
    hits?: Array<{
      pageURL?: string;
      user?: string;
      duration?: number;
      videos?: {
        large?: { url?: string; width?: number; height?: number };
        medium?: { url?: string; width?: number; height?: number };
        small?: { url?: string; width?: number; height?: number };
      };
    }>;
  };

  const hits: StockHit[] = [];
  for (const hit of data.hits ?? []) {
    const file = hit.videos?.large ?? hit.videos?.medium ?? hit.videos?.small;
    if (!file?.url) continue;
    const width = file.width ?? 0;
    const height = file.height ?? 0;
    const durationSec = Number(hit.duration ?? 0);
    hits.push({
      provider: 'pixabay',
      sourceUrl: hit.pageURL ?? file.url,
      downloadUrl: file.url,
      author: hit.user ?? null,
      license: 'Pixabay License',
      width,
      height,
      durationSec,
      score: scoreVideo({ width, height, durationSec }),
    });
  }
  return hits;
}

/** Busca o melhor vídeo de stock para a query (Pexels → Pixabay). */
export async function searchBestStock(query: string, usedUrls: Set<string>): Promise<StockHit> {
  if (!config.media.pexelsApiKey && !config.media.pixabayApiKey) {
    throw new Error(
      'Configure PEXELS_API_KEY e/ou PIXABAY_API_KEY no .env para buscar mídia de stock.',
    );
  }

  const [pexels, pixabay] = await Promise.all([searchPexels(query), searchPixabay(query)]);
  const ranked = [...pexels, ...pixabay]
    .filter((hit) => !usedUrls.has(hit.downloadUrl) && !usedUrls.has(hit.sourceUrl))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best) {
    throw new Error(`Nenhuma mídia encontrada para a query "${query}".`);
  }
  return best;
}
