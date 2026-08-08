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
  whisper: {
    /** Quando false, clipes com transcribe=true falham com mensagem clara. */
    enabled: bool('WHISPER_ENABLED', true),
    /** Binário whisper.cpp no PATH (whisper-cli ou main). */
    bin: str('WHISPER_BIN', 'whisper-cli'),
    /** Caminho do modelo ggml (ex.: ./models/ggml-base.bin). */
    model: str('WHISPER_MODEL', ''),
    language: str('WHISPER_LANGUAGE', 'pt'),
  },
  ollama: {
    baseUrl: str('OLLAMA_BASE_URL', 'http://127.0.0.1:11434'),
    model: str('OLLAMA_MODEL', 'llama3.2'),
  },
  media: {
    pexelsApiKey: str('PEXELS_API_KEY', ''),
    pixabayApiKey: str('PIXABAY_API_KEY', ''),
  },
  piper: {
    bin: str('PIPER_BIN', 'piper'),
    /** Caminho do modelo .onnx (ex.: ./models/pt_BR-faber-medium.onnx). */
    model: str('PIPER_MODEL', ''),
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
  },
  tmpDir: path.resolve(repoRoot, 'tmp'),
} as const;

export type AppConfig = typeof config;
