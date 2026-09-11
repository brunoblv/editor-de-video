import type { Clip, MediaAsset, Project } from '@editor-video/db';

export interface ClipDTO {
  id: string;
  position: number;
  originalName: string;
  label: string | null;
  transcribe: boolean;
  maxDurationSec: number;
  sizeByte: number;
  sourceKey: string;
  sourceDurationSec: number | null;
  normalizedDurationSec: number | null;
}

export interface MediaAssetDTO {
  id: string;
  provider: string;
  sourceUrl: string;
  author: string | null;
  license: string | null;
  query: string;
  position: number;
}

export interface ProjectDTO {
  id: string;
  title: string;
  watermark: string | null;
  status: string;
  kind: string;
  topic: string | null;
  pillar: string | null;
  scheduledAt: string | null;
  progress: number;
  stage: string | null;
  errorMessage: string | null;
  outputKey: string | null;
  outputSizeByte: number | null;
  scriptJson: unknown;
  environment: string | null;
  weather: string | null;
  timeOfDay: string | null;
  purpose: string | null;
  durationMinutes: number | null;
  preset: string | null;
  seed: number | null;
  conceptJson: unknown;
  ambientConfigJson: unknown;
  audioTimelineJson: unknown;
  visualTimelineJson: unknown;
  qualityScore: number | null;
  qualityJson: unknown;
  previewKey: string | null;
  metadataJson: unknown;
  recipeId: string | null;
  recipeVersion: number | null;
  universe: string | null;
  variationId: string | null;
  seriesId: string | null;
  seriesEpisode: number | null;
  youtubeVideoId: string | null;
  youtubeShortId: string | null;
  youtubePlaylistIds: string[];
  publishedAt: string | null;
  rabiscoThought: string | null;
  rabiscoScriptJson: unknown;
  characterScenesJson: unknown;
  durationPreset: string | null;
  clips: ClipDTO[];
  mediaAssets: MediaAssetDTO[];
}

/** Achata os modelos do Prisma (Date, Decimal) para algo serializável ao client. */
export function toProjectDTO(
  project: Project & { clips: Clip[]; mediaAssets?: MediaAsset[] },
): ProjectDTO {
  return {
    id: project.id,
    title: project.title,
    watermark: project.watermark,
    status: project.status,
    kind: project.kind,
    topic: project.topic,
    pillar: project.pillar ?? null,
    scheduledAt: project.scheduledAt ? project.scheduledAt.toISOString() : null,
    progress: project.progress,
    stage: project.stage,
    errorMessage: project.errorMessage,
    outputKey: project.outputKey,
    outputSizeByte: project.outputSizeByte,
    scriptJson: project.scriptJson,
    environment: project.environment ?? null,
    weather: project.weather ?? null,
    timeOfDay: project.timeOfDay ?? null,
    purpose: project.purpose ?? null,
    durationMinutes: project.durationMinutes ?? null,
    preset: project.preset ?? null,
    seed: project.seed ?? null,
    conceptJson: project.conceptJson ?? null,
    ambientConfigJson: project.ambientConfigJson ?? null,
    audioTimelineJson: project.audioTimelineJson ?? null,
    visualTimelineJson: project.visualTimelineJson ?? null,
    qualityScore: project.qualityScore ?? null,
    qualityJson: project.qualityJson ?? null,
    previewKey: project.previewKey ?? null,
    metadataJson: project.metadataJson ?? null,
    recipeId: project.recipeId ?? null,
    recipeVersion: project.recipeVersion ?? null,
    universe: project.universe ?? null,
    variationId: project.variationId ?? null,
    seriesId: project.seriesId ?? null,
    seriesEpisode: project.seriesEpisode ?? null,
    youtubeVideoId: project.youtubeVideoId ?? null,
    youtubeShortId: project.youtubeShortId ?? null,
    youtubePlaylistIds: project.youtubePlaylistIds ?? [],
    publishedAt: project.publishedAt ? project.publishedAt.toISOString() : null,
    rabiscoThought: project.rabiscoThought ?? null,
    rabiscoScriptJson: project.rabiscoScriptJson ?? null,
    characterScenesJson: project.characterScenesJson ?? null,
    durationPreset: project.durationPreset ?? null,
    clips: project.clips.map((clip) => ({
      id: clip.id,
      position: clip.position,
      originalName: clip.originalName,
      label: clip.label,
      transcribe: clip.transcribe,
      maxDurationSec: clip.maxDurationSec,
      sizeByte: clip.sizeByte,
      sourceKey: clip.sourceKey,
      sourceDurationSec: clip.sourceDurationSec,
      normalizedDurationSec: clip.normalizedDurationSec,
    })),
    mediaAssets: (project.mediaAssets ?? []).map((asset) => ({
      id: asset.id,
      provider: asset.provider,
      sourceUrl: asset.sourceUrl,
      author: asset.author,
      license: asset.license,
      query: asset.query,
      position: asset.position,
    })),
  };
}

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho',
  QUEUED: 'Na fila',
  PROCESSING: 'Processando',
  WAITING_PREVIEW_APPROVAL: 'Aguardando preview',
  READY: 'Pronto',
  READY_FOR_REVIEW: 'Aguardando revisão',
  PUBLISHED: 'Publicado',
  FAILED: 'Falhou',
};

export const KIND_LABEL: Record<string, string> = {
  TOP_LIST: 'Top List',
  CURIOSIDADE: 'Curiosidade',
  AMBIENT: 'Midnight Ambient',
  CHRISTIAN: 'Canal Cristão',
  RABISCO: 'Rabisco',
};

export function fileUrl(key: string, download = false): string {
  const path = key.split('/').map(encodeURIComponent).join('/');
  return `/api/files/${path}${download ? '?download=1' : ''}`;
}
