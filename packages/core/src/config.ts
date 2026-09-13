import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// O .env vive na raiz do monorepo; cada app roda de um cwd diferente,
// então resolvemos o caminho a partir deste arquivo (packages/core/dist).
const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..', '..', '..');

loadEnv({ path: path.join(repoRoot, '.env'), quiet: true });

function str(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Variável de ambiente ${name} precisa ser numérica (recebido: "${raw}")`);
  }
  return parsed;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function list(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const items = raw.split(',').map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : fallback;
}

/**
 * Cada modelo Gemini tem cota diária própria — quando o principal estoura
 * (429), tentamos o próximo em vez de falhar a geração inteira.
 */
const DEFAULT_GEMINI_MODEL_FALLBACKS = [
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
  'gemini-3-flash',
];

export const config = {
  databaseUrl: str('DATABASE_URL', 'postgresql://editor:editor@localhost:55432/editor_video?schema=public'),
  redisUrl: str('REDIS_URL', 'redis://localhost:56379'),
  storage: {
    driver: str('STORAGE_DRIVER', 'local'),
    localDir: path.resolve(repoRoot, str('STORAGE_LOCAL_DIR', './storage')),
  },
  limits: {
    maxClipSizeBytes: num('MAX_CLIP_SIZE_MB', 100) * 1024 * 1024,
    maxClipDurationSec: num('MAX_CLIP_DURATION_SEC', 60),
    maxClipsPerProject: num('MAX_CLIPS_PER_PROJECT', 10),
    minClipsPerProject: num('MIN_CLIPS_PER_PROJECT', 3),
  },
  video: {
    width: num('VIDEO_WIDTH', 1080),
    height: num('VIDEO_HEIGHT', 1920),
    fps: num('VIDEO_FPS', 30),
  },
  render: {
    concurrency: num('RENDER_CONCURRENCY', 1),
  },
  captions: {
    /** gemini (padrão) ou whisper. */
    provider: str('CAPTIONS_PROVIDER', 'gemini'),
    /** Estilo visual padrão das legendas: minimal | highlight | handwritten. */
    style: str('CAPTION_STYLE', 'minimal'),
    language: str('CAPTIONS_LANGUAGE', str('WHISPER_LANGUAGE', 'pt')),
    /** Modelo multimodal — precisa aceitar áudio. Vazio herda GEMINI_MODEL. */
    geminiModel: str('GEMINI_CAPTIONS_MODEL', str('GEMINI_MODEL', 'gemini-3.5-flash-lite')),
    /** Modelos tentados em sequência quando o principal estoura a cota (429). */
    geminiModelFallbacks: list(
      'GEMINI_CAPTIONS_MODEL_FALLBACKS',
      list('GEMINI_MODEL_FALLBACKS', DEFAULT_GEMINI_MODEL_FALLBACKS),
    ),
  },
  whisper: {
    /** Fallback local quando CAPTIONS_PROVIDER=whisper ou o Gemini falha. */
    enabled: bool('WHISPER_ENABLED', true),
    /** Binário whisper.cpp no PATH (whisper-cli ou main). */
    bin: str('WHISPER_BIN', 'whisper-cli'),
    /** Caminho do modelo ggml (ex.: ./models/ggml-base.bin). */
    model: str('WHISPER_MODEL', ''),
    language: str('WHISPER_LANGUAGE', 'pt'),
  },
  media: {
    pexelsApiKey: str('PEXELS_API_KEY', ''),
    pixabayApiKey: str('PIXABAY_API_KEY', ''),
  },
  piper: {
    bin: str('PIPER_BIN', 'piper'),
    /** Caminho do modelo .onnx (ex.: ./models/pt_BR-faber-medium.onnx). */
    model: str('PIPER_MODEL', ''),
    /** >1 = fala mais devagar (docs/Cristão/projeto.md §18 — voz calma/contemplativa). */
    lengthScale: num('PIPER_LENGTH_SCALE', 1.15),
    /** Segundos de silêncio após cada frase — pausas mais naturais entre ideias. */
    sentenceSilence: num('PIPER_SENTENCE_SILENCE', 0.5),
  },
  curiosidade: {
    minDurationSec: num('CURIOSIDADE_MIN_DURATION_SEC', 25),
    maxDurationSec: num('CURIOSIDADE_MAX_DURATION_SEC', 50),
    visualQueries: num('CURIOSIDADE_VISUAL_QUERIES', 6),
  },
  ambient: {
    defaultDurationMinutes: num('AMBIENT_DEFAULT_DURATION_MIN', 60),
    defaultPurpose: str('AMBIENT_DEFAULT_PURPOSE', 'sleep'),
    qualityThreshold: num('AMBIENT_QUALITY_THRESHOLD', 75),
    maxRetries: num('AMBIENT_MAX_RETRIES', 2),
    previewDurationSec: num('AMBIENT_PREVIEW_DURATION_SEC', 60),
    autoConcept: bool('AMBIENT_AUTO_CONCEPT', false),
    autoSearch: bool('AMBIENT_AUTO_SEARCH', true),
    autoPublish: bool('AMBIENT_AUTO_PUBLISH', false),
    width: num('AMBIENT_VIDEO_WIDTH', 1920),
    height: num('AMBIENT_VIDEO_HEIGHT', 1080),
    fps: num('AMBIENT_VIDEO_FPS', 30),
    freesoundApiKey: str('FREESOUND_API_KEY', ''),
    maxDurationMinutes: num('AMBIENT_MAX_DURATION_MIN', 600),
    maxDownloadBytes: num('AMBIENT_MAX_DOWNLOAD_MB', 500) * 1024 * 1024,
    sleepMinDurationMinutes: num('AMBIENT_SLEEP_MIN_DURATION_MIN', 60),
    sleepMaxDurationMinutes: num('AMBIENT_SLEEP_MAX_DURATION_MIN', 600),
    cozyFocusMaxDurationMinutes: num('AMBIENT_COZY_FOCUS_MAX_DURATION_MIN', 180),
  },
  voiceDirector: {
    /** Kill switch — false volta pro caminho antigo (narração única, sem segmentação). */
    enabled: bool('ENABLE_VOICE_DIRECTION', true),
    /** Sempre Gemini TTS. */
    provider: str('TTS_PROVIDER', 'gemini'),
    geminiVoiceName: str('GEMINI_TTS_VOICE', 'Orus'),
    geminiModel: str('GEMINI_TTS_MODEL', 'gemini-2.5-flash-preview-tts'),
    /** Modelos TTS alternativos tentados em sequência em caso de 429 — cada um tem cota diária própria. */
    geminiModelFallbacks: list('GEMINI_TTS_MODEL_FALLBACKS', [
      'gemini-3.1-flash-tts-preview',
      'gemini-2.5-pro-preview-tts',
    ]),
  },
  music: {
    /** Pasta com faixas instrumentais royalty-free (.mp3/.wav/.m4a/.ogg), relativa à raiz do monorepo. */
    dir: str('MUSIC_DIR', 'music'),
    /** Volume relativo da trilha (0–1) — baixo o suficiente pra não competir com a narração. */
    volume: num('MUSIC_VOLUME', 0.06),
  },
  christian: {
    geminiApiKey: str('GEMINI_API_KEY', ''),
    geminiModel: str('GEMINI_MODEL', 'gemini-3.5-flash-lite'),
    geminiModelFallbacks: list('GEMINI_MODEL_FALLBACKS', DEFAULT_GEMINI_MODEL_FALLBACKS),
    /** Dias mínimos antes de reutilizar o mesmo versículo. */
    verseReuseDays: num('VERSE_REUSE_DAYS', 180),
    /** Dias mínimos antes de reutilizar o mesmo pilar de conteúdo. */
    themeReuseDays: num('THEME_REUSE_DAYS', 14),
    minDurationSec: num('CHRISTIAN_MIN_DURATION_SEC', 25),
    maxDurationSec: num('CHRISTIAN_MAX_DURATION_SEC', 50),
    visualQueries: num('CHRISTIAN_VISUAL_QUERIES', 5),
    /** userId usado por scripts de automação (generate:daily) sem sessão HTTP. */
    automationUserId: str('CHRISTIAN_AUTOMATION_USER_ID', ''),
    /** Handle do canal (ex.: "@minutodefe56") — usado como watermark padrão. */
    youtubeHandle: str('CHRISTIAN_YOUTUBE_HANDLE', ''),
  },
  rabisco: {
    /** Reaproveita a chave do Christian por padrão — permite override via env se precisar de cota separada. */
    geminiApiKey: str('RABISCO_GEMINI_API_KEY', str('GEMINI_API_KEY', '')),
    geminiModel: str('RABISCO_GEMINI_MODEL', 'gemini-3.5-flash-lite'),
    geminiModelFallbacks: list(
      'RABISCO_GEMINI_MODEL_FALLBACKS',
      list('GEMINI_MODEL_FALLBACKS', DEFAULT_GEMINI_MODEL_FALLBACKS),
    ),
    /** SHORT apenas no MVP (docs/RABISCO.md §23). */
    minDurationSec: num('RABISCO_MIN_DURATION_SEC', 30),
    maxDurationSec: num('RABISCO_MAX_DURATION_SEC', 45),
  },
  auth: {
    secret: str('AUTH_SECRET', str('NEXTAUTH_SECRET', '')),
  },
  youtube: {
    clientId: str('GOOGLE_CLIENT_ID', ''),
    clientSecret: str('GOOGLE_CLIENT_SECRET', ''),
    redirectUri: str(
      'YOUTUBE_REDIRECT_URI',
      'http://localhost:3000/api/youtube/callback',
    ),
  },
  tmpDir: path.resolve(repoRoot, 'tmp'),
} as const;

export type AppConfig = typeof config;
