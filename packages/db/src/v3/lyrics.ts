/**
 * Reactive Lyrics Studio no hub V3 (docs/claude-reactive-lyrics-implementacao.md).
 *
 * O projeto é um VideoProject comum: letra, tempos e visual vivem na timeline
 * (trilha 'lyrics' + composição `reactive-lyrics` + música em A1) e só mudam
 * por revisão. `LyricsProject` guarda o que não é edição: áudio de origem,
 * arquivo de letra, declaração de direitos e a chave do mapa musical.
 */
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { getStorage } from '@editor-video/core/server';
import {
  defaultLyricsParams,
  detectLyricFormat,
  DomainError,
  LYRICS_LIMITS,
  LYRICS_PRESETS,
  musicalMapSchema,
  parseLyrics,
  seedLyricsTimeline,
  stepCacheKey,
  transcriptToLyricLines,
  type LyricLine,
  type TranscribedSegment,
  type LyricFormat,
  type LyricsPresetId,
  type MusicalMap,
} from '@editor-video/domain';
import { downloadYoutubeAudio, isYoutubeVideoId, MUSIC_ANALYSIS_VERSION } from '@editor-video/integrations';
import {
  createTimeline,
  lyricIssuesInTimeline,
  lyricItemsFromImport,
  lyricLines,
  lyricsTrack,
  lyricStatusCounts,
  MS_RATE,
  parseTimeline,
  rescale,
  timelineRate,
  type TimelineDocument,
  type TimelineOperation,
} from '@editor-video/timeline';
import type { Asset, LyricsProject } from '@prisma/client';
import { prisma } from '../client.js';
import { authorizeAsset, authorizeProject, requireRole, type Actor } from './access.js';
import { assetToRef, registerAssetFromFile } from './assets.js';
import { enqueueJob, V3_QUEUES } from './jobs.js';
import { commitDocument, commitPatch, createProject } from './projects.js';

export const LYRICS_FORMATS = ['9:16', '16:9'] as const;

/** Chave do mapa musical no storage: conteúdo (sha256) + versão do algoritmo. */
export function musicMapKey(audioSha256: string, version: string = MUSIC_ANALYSIS_VERSION): string {
  return `cache/music/${audioSha256}-${version}.json`;
}

export async function writeMusicalMap(map: MusicalMap): Promise<string> {
  const key = musicMapKey(map.audioHash, map.analysisVersion);
  await getStorage().put(key, Readable.from(Buffer.from(JSON.stringify(map))));
  return key;
}

export async function readMusicalMap(key: string): Promise<MusicalMap> {
  const storage = getStorage();
  if (!(await storage.exists(key))) throw new DomainError('DEPENDENCY_MISSING', 'Mapa musical ausente no storage; rode a análise de novo.');
  const raw = await fsp.readFile(await storage.toLocalPath(key), 'utf8');
  return musicalMapSchema.parse(JSON.parse(raw));
}

/**
 * Lê a linha do projeto Lyrics. Tolera a tabela ainda não migrada (P2021) para
 * que projetos comuns continuem abrindo antes de `db:migrate:deploy`.
 */
export async function findLyricsProject(projectId: string): Promise<LyricsProject | null> {
  try {
    return await prisma.lyricsProject.findUnique({ where: { projectId } });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2021') return null;
    throw err;
  }
}

export type CreateLyricsProjectInput = {
  channelId: string;
  title: string;
  formats: Array<(typeof LYRICS_FORMATS)[number]>;
  audioAssetId: string;
  /** Letra enviada; tem prioridade sobre a transcrição automática. */
  lyrics?: { content: string; fileName?: string | null; format?: LyricFormat | null } | null;
  /** Sem letra enviada: transcreve o trecho com Whisper e importa como sugestão. */
  autoLyrics?: boolean;
  language?: string | null;
  presetId: LyricsPresetId;
  segmentStartMs: number;
  segmentDurationMs: number;
  credit?: string | null;
  rights: { declared: boolean; note?: string | null };
};

function assertAudio(asset: Asset): void {
  const ext = path.extname(asset.originalName).toLowerCase();
  if (asset.kind !== 'AUDIO' || !(LYRICS_LIMITS.audioExtensions as readonly string[]).includes(ext)) {
    throw new DomainError('INVALID', `Use um áudio ${LYRICS_LIMITS.audioExtensions.join(', ')}.`);
  }
  if (asset.status !== 'READY' || !asset.sha256) throw new DomainError('DEPENDENCY_MISSING', 'O áudio ainda está sendo processado.');
  if ((asset.durationSec ?? 0) <= 0) throw new DomainError('INVALID', 'Áudio sem duração legível.');
  if ((asset.durationSec ?? 0) > LYRICS_LIMITS.maxAudioSec) throw new DomainError('LIMIT', `Áudio acima de ${LYRICS_LIMITS.maxAudioSec} s.`);
  if (asset.sizeBytes != null && Number(asset.sizeBytes) > LYRICS_LIMITS.maxAudioBytes) throw new DomainError('LIMIT', 'Áudio acima do limite de tamanho.');
}

function parseLyricsInput(input: { content: string; fileName?: string | null; format?: LyricFormat | null }, durationMs: number, language: string | null) {
  if (Buffer.byteLength(input.content, 'utf8') > LYRICS_LIMITS.maxLyricsBytes) throw new DomainError('LIMIT', 'Letra acima de 256 KB.');
  if (!input.content.trim()) throw new DomainError('INVALID', 'A letra está vazia.');
  const fileName = path.basename(input.fileName || 'letra.txt');
  const format = input.format ?? detectLyricFormat(fileName, input.content);
  try {
    return { format, fileName, alignment: parseLyrics(input.content, format, { durationMs, language }) };
  } catch (err) {
    throw new DomainError('INVALID', `Letra ilegível (${format}): ${(err as Error).message}`);
  }
}

/**
 * Confere antes de gravar qualquer coisa que o banco tem a tabela do Lyrics
 * e que o Prisma Client foi gerado com ela (servidor reiniciado após o generate).
 */
export async function assertLyricsStorageReady(): Promise<void> {
  const delegate = (prisma as unknown as { lyricsProject?: { findFirst: (a: object) => Promise<unknown> } }).lyricsProject;
  if (!delegate) {
    throw new DomainError('DEPENDENCY_MISSING', 'O Prisma Client está desatualizado: rode "npx prisma generate" em packages/db e reinicie o servidor.');
  }
  try {
    await delegate.findFirst({ select: { id: true } });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2021') {
      throw new DomainError('DEPENDENCY_MISSING', 'O banco ainda não tem a migração do Reactive Lyrics. Faça backup e rode "npm run db:migrate:deploy".');
    }
    throw err;
  }
}

/** Cria projeto + revisão com música, composição e letra; enfileira a análise musical. */
export async function createLyricsProject(actor: Actor, input: CreateLyricsProjectInput) {
  await assertLyricsStorageReady();
  if (!LYRICS_PRESETS[input.presetId]) throw new DomainError('INVALID', `Preset desconhecido: ${input.presetId}`);
  const formats = input.formats.length > 0 ? input.formats : ['9:16' as const];
  for (const f of formats) if (!(LYRICS_FORMATS as readonly string[]).includes(f)) throw new DomainError('INVALID', `Formato ${f} não suportado no Lyrics.`);
  const audio = await authorizeAsset(actor, input.audioAssetId, 'project.edit');
  assertAudio(audio);
  const durationMs = Math.round(audio.durationSec! * 1000);
  const segmentStartMs = Math.max(0, Math.round(input.segmentStartMs));
  const segmentDurationMs = Math.min(Math.round(input.segmentDurationMs), durationMs - segmentStartMs);
  if (segmentDurationMs < 1000) throw new DomainError('INVALID', 'O trecho precisa ter pelo menos 1 s dentro da música.');
  const hasLyrics = Boolean(input.lyrics?.content.trim());
  if (!hasLyrics && !input.autoLyrics) throw new DomainError('INVALID', 'Envie a letra ou peça a transcrição automática.');
  const parsed = hasLyrics ? parseLyricsInput(input.lyrics!, durationMs, input.language ?? null) : null;
  const seedInput = {
    audio: assetToRef(audio),
    segmentStartMs,
    segmentDurationMs,
    lines: parsed?.alignment.lines ?? [],
    offsetMs: parsed?.alignment.offsetMs ?? 0,
    presetId: input.presetId,
    credit: input.credit ?? undefined,
  };
  // Valida tudo antes de criar qualquer registro (não deixa projeto pela metade).
  const probe = seedLyricsTimeline(createTimeline({ projectId: 'probe', revisionId: 'probe', width: 1080, height: 1920 }), seedInput);
  if (parsed && probe.items.length === 0) throw new DomainError('INVALID', 'Nenhuma linha da letra cai no trecho escolhido.', { skipped: probe.skipped });

  // Arquivo de letra vira asset (proveniência); conteúdo idêntico é deduplicado por hash.
  let lyricsAsset: Asset | null = null;
  if (parsed) {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ev-lyrics-'));
    try {
      const ext = path.extname(parsed.fileName).toLowerCase();
      const safeName = (LYRICS_LIMITS.lyricsExtensions as readonly string[]).includes(ext) ? parsed.fileName : `letra.${parsed.format}`;
      const tmp = path.join(tmpDir, `letra.${parsed.format}`);
      await fsp.writeFile(tmp, input.lyrics!.content, 'utf8');
      lyricsAsset = await registerAssetFromFile(actor, { workspaceId: audio.workspaceId, localPath: tmp, originalName: safeName, mimeType: 'text/plain', provider: 'upload', tags: ['lyrics'] });
    } finally {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  }

  const project = await createProject(actor, {
    channelId: input.channelId,
    title: input.title,
    formats,
    targetDurationSec: Math.round(segmentDurationMs / 1000),
  });
  try {
    return await finishLyricsProject(actor, input, { project, audio, lyricsAsset, parsed, seedInput, skipped: probe.skipped });
  } catch (err) {
    // Não deixa projeto pela metade: a timeline sem a linha do Lyrics abriria como projeto comum.
    await prisma.videoProject.delete({ where: { id: project.id } }).catch(() => undefined);
    throw err;
  }
}

async function finishLyricsProject(
  actor: Actor,
  input: CreateLyricsProjectInput,
  ctx: {
    project: Awaited<ReturnType<typeof createProject>>;
    audio: Asset;
    lyricsAsset: Asset | null;
    parsed: ReturnType<typeof parseLyricsInput> | null;
    seedInput: Parameters<typeof seedLyricsTimeline>[1];
    skipped: Array<{ text: string; reason: string }>;
  },
) {
  const { project, audio, lyricsAsset, parsed, seedInput } = ctx;
  if (project.workspaceId !== audio.workspaceId) throw new DomainError('NOT_FOUND', 'Áudio não encontrado neste workspace.');
  let skipped = ctx.skipped;
  const committed = await commitDocument(
    actor,
    project.id,
    project.currentRevisionId!,
    (doc) => {
      const seeded = seedLyricsTimeline(doc, seedInput);
      skipped = seeded.skipped;
      return seeded.doc;
    },
    'Projeto Reactive Lyrics criado',
  );
  const lyrics = await prisma.lyricsProject.create({
    data: {
      projectId: project.id,
      audioAssetId: audio.id,
      lyricsAssetId: lyricsAsset?.id ?? null,
      language: input.language ?? null,
      lyricsFormat: parsed?.format ?? 'asr',
      rightsDeclaredAt: input.rights.declared ? new Date() : null,
      rightsDeclaredById: input.rights.declared ? actor.userId : null,
      rightsNote: input.rights.note?.slice(0, 1000) ?? null,
    },
  });
  const job = await requestLyricsAnalysis(actor, project.id);
  const transcription = parsed ? null : await requestLyricsTranscription(actor, project.id);
  return { project: { ...project, currentRevisionId: committed.revisionId }, lyrics, skipped, analysisJobId: job.jobId, transcriptionJobId: transcription?.jobId ?? null };
}

/** Enfileira a análise musical (cacheada por hash + versão: refazer é barato). */
export async function requestLyricsAnalysis(actor: Actor, projectId: string) {
  await authorizeProject(actor, projectId, 'project.edit');
  const lyrics = await findLyricsProject(projectId);
  if (!lyrics) throw new DomainError('NOT_FOUND', 'Projeto não é Reactive Lyrics.');
  const audio = await prisma.asset.findUniqueOrThrow({ where: { id: lyrics.audioAssetId } });
  const existing = await prisma.renderJob.findFirst({ where: { projectId, kind: 'ANALYZE', assetId: audio.id, state: { in: ['QUEUED', 'RUNNING'] } } });
  if (existing) return { jobId: existing.id };
  const job = await enqueueJob({
    projectId,
    kind: 'ANALYZE',
    queue: V3_QUEUES.analysis,
    assetId: audio.id,
    params: { music: true },
    requestedById: actor.userId,
  });
  return { jobId: job.id };
}

/** Grava o resultado da análise em todos os projetos Lyrics que usam o áudio. */
export async function attachMusicalMap(audioAssetId: string, key: string, map: Pick<MusicalMap, 'analysisVersion' | 'bpmEstimate'>) {
  await prisma.lyricsProject.updateMany({ where: { audioAssetId }, data: { musicalMapKey: key, analysisVersion: map.analysisVersion, bpmEstimate: map.bpmEstimate } });
}

/** Trecho da música usado pela timeline (clipe de áudio em A1). */
export function lyricsSegment(doc: TimelineDocument, audioAssetId: string) {
  const clip = doc.tracks.flatMap((t) => (t.type === 'audio' ? t.items : [])).find((i) => i.kind === 'clip' && i.assetId === audioAssetId);
  const asset = doc.assets[audioAssetId];
  if (!clip || clip.kind !== 'clip' || !asset) throw new DomainError('INVALID', 'A música saiu da timeline (trilha A1).');
  return {
    itemId: clip.id,
    timelineStart: clip.timelineStart,
    frames: clip.duration,
    startMs: rescale(clip.sourceIn, asset.sourceTimebase, MS_RATE),
    durationMs: rescale(clip.sourceOut - clip.sourceIn, asset.sourceTimebase, MS_RATE),
  };
}

async function loadLyricsContext(actor: Actor, projectId: string, action: 'project.view' | 'project.edit') {
  const project = await authorizeProject(actor, projectId, action);
  const lyrics = await findLyricsProject(projectId);
  if (!lyrics) throw new DomainError('NOT_FOUND', 'Projeto não é Reactive Lyrics.');
  const revision = await prisma.timelineRevision.findUniqueOrThrow({ where: { id: project.currentRevisionId! } });
  return { project, lyrics, doc: parseTimeline(revision.documentJson) };
}

/** Estado para o estúdio: direitos, análise, segmento e QA da letra. */
export async function getLyricsState(actor: Actor, projectId: string) {
  const { lyrics, doc } = await loadLyricsContext(actor, projectId, 'project.view');
  const audio = await prisma.asset.findUniqueOrThrow({ where: { id: lyrics.audioAssetId }, select: { id: true, originalName: true, storageKey: true, durationSec: true, sha256: true, license: true, author: true } });
  const job = await prisma.renderJob.findFirst({ where: { projectId, kind: 'ANALYZE', assetId: audio.id }, orderBy: { createdAt: 'desc' }, select: { id: true, state: true, progress: true, stage: true, errorMessage: true } });
  const transcriptionJob = await prisma.renderJob.findFirst({ where: { projectId, kind: 'TRANSCRIBE' }, orderBy: { createdAt: 'desc' }, select: { id: true, state: true, progress: true, stage: true, errorMessage: true } });
  const transcript = await latestLyricsTranscript(audio.id);
  return {
    lyrics,
    audio,
    segment: lyricsSegment(doc, audio.id),
    analysis: { ready: Boolean(lyrics.musicalMapKey), version: lyrics.analysisVersion, bpm: lyrics.bpmEstimate, job },
    transcription: { job: transcriptionJob, available: Boolean(transcript), model: transcript?.model ?? null, language: transcript?.language ?? null },
    issues: lyricIssuesInTimeline(doc),
    counts: lyricStatusCounts(doc),
  };
}

/** Mapa musical recortado no trecho da timeline, em ms relativos ao início do trecho. */
export async function getLyricsMap(actor: Actor, projectId: string) {
  const { lyrics, doc } = await loadLyricsContext(actor, projectId, 'project.view');
  if (!lyrics.musicalMapKey) throw new DomainError('DEPENDENCY_MISSING', 'A análise musical ainda não terminou.');
  const map = await readMusicalMap(lyrics.musicalMapKey);
  const seg = lyricsSegment(doc, lyrics.audioAssetId);
  const step = map.features.sampleIntervalMs;
  const from = Math.floor(seg.startMs / step);
  const count = Math.ceil(seg.durationMs / step);
  const cut = (s: number[]) => s.slice(from, from + count);
  const inside = (t: number) => t >= seg.startMs && t < seg.startMs + seg.durationMs;
  return {
    sampleIntervalMs: step,
    offsetMs: from * step - seg.startMs,
    durationMs: seg.durationMs,
    bpm: map.bpmEstimate,
    analysisVersion: map.analysisVersion,
    rms: cut(map.features.rms),
    bass: cut(map.features.bass),
    mids: cut(map.features.mids),
    treble: cut(map.features.treble),
    beats: map.beatTimesMs.filter(inside).map((t) => t - seg.startMs),
    onsets: map.onsets.filter((o) => inside(o.timeMs)).map((o) => ({ timeMs: o.timeMs - seg.startMs, strength: o.strength })),
  };
}

export async function declareLyricsRights(actor: Actor, projectId: string, input: { declared: boolean; note?: string | null }) {
  await loadLyricsContext(actor, projectId, 'project.edit');
  return prisma.lyricsProject.update({
    where: { projectId },
    data: input.declared
      ? { rightsDeclaredAt: new Date(), rightsDeclaredById: actor.userId, rightsNote: input.note?.slice(0, 1000) ?? null }
      : { rightsDeclaredAt: null, rightsDeclaredById: null },
  });
}

/**
 * Reimporta a letra: substitui as linhas não validadas e preserva as
 * validadas (bloqueadas). Linhas novas que cruzem uma validada são puladas.
 */
export async function reimportLyrics(actor: Actor, projectId: string, input: { content: string; fileName?: string | null; expectedRevisionId: string }) {
  const { lyrics, doc } = await loadLyricsContext(actor, projectId, 'project.edit');
  const audio = await prisma.asset.findUniqueOrThrow({ where: { id: lyrics.audioAssetId } });
  const parsed = parseLyricsInput({ content: input.content, fileName: input.fileName }, Math.round((audio.durationSec ?? 0) * 1000), lyrics.language);
  const result = await replaceUnlockedLyrics(actor, projectId, doc, audio.id, parsed.alignment.lines, parsed.alignment.offsetMs, input.expectedRevisionId, `Letra reimportada (${parsed.format})`);
  await prisma.lyricsProject.update({ where: { projectId }, data: { lyricsFormat: parsed.format } });
  return result;
}

/**
 * Troca as linhas não validadas pelas novas; validadas (bloqueadas) ficam.
 * Linhas novas que cruzem uma validada são puladas e reportadas.
 */
async function replaceUnlockedLyrics(
  actor: Actor,
  projectId: string,
  doc: TimelineDocument,
  audioAssetId: string,
  lines: LyricLine[],
  offsetMs: number,
  expectedRevisionId: string,
  summary: string,
  origin: 'human' | 'system' = 'human',
) {
  const seg = lyricsSegment(doc, audioAssetId);
  const track = lyricsTrack(doc);
  if (!track) throw new DomainError('INVALID', 'Trilha de letra ausente.');
  const kept = lyricLines(doc).filter((l) => l.locked);
  const imported = lyricItemsFromImport(lines, {
    fps: timelineRate(doc),
    segmentStartMs: seg.startMs,
    segmentFrames: seg.frames,
    offsetMs,
    idPrefix: `ly${Date.now().toString(36)}-`,
  });
  const skipped = [...imported.skipped];
  const operations: TimelineOperation[] = lyricLines(doc)
    .filter((l) => !l.locked)
    .map((l) => ({ op: 'removeClip' as const, itemId: l.id }));
  for (const item of imported.items) {
    const clash = kept.find((k) => item.timelineStart < k.timelineStart + k.duration && k.timelineStart < item.timelineStart + item.duration);
    if (clash) {
      skipped.push({ text: item.text, reason: `Cruza a linha validada "${clash.text}"` });
      continue;
    }
    operations.push({ op: 'insertClip', trackId: track.id, item: { ...item, timelineStart: item.timelineStart + seg.timelineStart } });
  }
  if (operations.length === 0) throw new DomainError('INVALID', 'Nada a importar no trecho.', { skipped });
  const result = await commitPatch(actor, projectId, { expectedRevisionId, operations, origin: { author: origin }, summary });
  return { revisionId: result.revisionId, skipped, inserted: operations.filter((o) => o.op === 'insertClip').length };
}

// ---------------------------------------------------------------------------
// Áudio do YouTube e letra transcrita
// ---------------------------------------------------------------------------

/**
 * Baixa o áudio de um vídeo do YouTube (yt-dlp) e registra como asset com a
 * origem e a declaração de direitos. Decisão do usuário (04/11/2026): qualquer
 * vídeo, desde que a pessoa declare ter autorização; a interface avisa que
 * baixar contraria os termos do YouTube e que música comercial pode gerar
 * reivindicação.
 */
export async function importYoutubeLyricsAudio(actor: Actor & { workspaceId: string }, input: { videoId: string; rights: { declared: boolean; note?: string | null } }) {
  await requireRole(actor, actor.workspaceId, 'asset.upload');
  if (!isYoutubeVideoId(input.videoId)) throw new DomainError('INVALID', 'Vídeo do YouTube inválido.');
  if (!input.rights.declared) throw new DomainError('FORBIDDEN', 'Declare que você tem autorização para usar este áudio antes de baixar.');
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ev-yt-'));
  try {
    let downloaded: Awaited<ReturnType<typeof downloadYoutubeAudio>>;
    try {
      downloaded = await downloadYoutubeAudio(input.videoId, { outDir: dir, maxDurationSec: LYRICS_LIMITS.maxAudioSec });
    } catch (err) {
      const e = err as Error & { category?: string; code?: string };
      if (e.category === 'LIMIT') throw new DomainError('LIMIT', e.message);
      if (e.code === 'ENOENT') throw new DomainError('DEPENDENCY_MISSING', 'yt-dlp não encontrado. Instale-o ou defina YTDLP_BIN.');
      throw new DomainError('TRANSIENT', `Não foi possível baixar o áudio: ${e.message.slice(-300)}`);
    }
    const { file, info } = downloaded;
    const safeTitle = info.title.replace(/[^\p{L}\p{N} ._-]+/gu, '').trim().slice(0, 80) || info.videoId;
    const asset = await registerAssetFromFile(actor, {
      workspaceId: actor.workspaceId,
      localPath: file,
      originalName: `${safeTitle}.flac`,
      mimeType: 'audio/flac',
      provider: 'youtube',
      sourceUrl: info.url,
      author: info.channel,
      license: info.license ?? 'YouTube padrão (não verificada)',
      attribution: [info.title, info.channel].filter(Boolean).join(' — ').slice(0, 300),
      tags: ['youtube', 'lyrics', `rights:${actor.userId}`],
    });
    return { asset, info, rightsNote: input.rights.note?.slice(0, 1000) ?? null };
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

/** Enfileira a transcrição (Whisper) do trecho da música. */
export async function requestLyricsTranscription(actor: Actor, projectId: string) {
  const { lyrics } = await loadLyricsContext(actor, projectId, 'project.edit');
  const existing = await prisma.renderJob.findFirst({ where: { projectId, kind: 'TRANSCRIBE', state: { in: ['QUEUED', 'RUNNING'] } } });
  if (existing) return { jobId: existing.id };
  const job = await enqueueJob({
    projectId,
    kind: 'TRANSCRIBE',
    queue: V3_QUEUES.analysis,
    assetId: lyrics.audioAssetId,
    params: { lyrics: true },
    requestedById: actor.userId,
  });
  return { jobId: job.id };
}

/** Chave de cache da transcrição: áudio + trecho + idioma + modelo. */
export function lyricsTranscriptCacheKey(audioSha256: string, segment: { startMs: number; durationMs: number }, language: string | null, model: string): string {
  return stepCacheKey({ step: 'transcribe', assetHash: audioSha256, params: { mode: 'lyrics', ...segment, language }, model });
}

/** Última transcrição de letra do trecho atual (tempos em segundos da música). */
async function latestLyricsTranscript(audioAssetId: string) {
  return prisma.transcriptVersion.findFirst({ where: { assetId: audioAssetId, provider: { startsWith: 'lyrics:' } }, orderBy: { version: 'desc' } });
}

/**
 * Lado do worker: grava a transcrição e, se a letra ainda está vazia,
 * importa as linhas como sugestão (origem `asr`, nunca validadas).
 */
export async function saveLyricsTranscript(input: {
  projectId: string;
  requestedById: string | null;
  audioAssetId: string;
  cacheKey: string;
  transcript: { language: string; provider: string; model: string; segments: TranscribedSegment[] };
}) {
  const existing = await prisma.transcriptVersion.findFirst({ where: { assetId: input.audioAssetId, cacheKey: input.cacheKey } });
  if (!existing) {
    const last = await prisma.transcriptVersion.findFirst({ where: { assetId: input.audioAssetId }, orderBy: { version: 'desc' } });
    await prisma.transcriptVersion.create({
      data: {
        assetId: input.audioAssetId,
        version: (last?.version ?? 0) + 1,
        language: input.transcript.language,
        provider: `lyrics:${input.transcript.provider}`,
        model: input.transcript.model,
        cacheKey: input.cacheKey,
        segmentsJson: input.transcript.segments as unknown as object,
      },
    });
  }
  if (!input.requestedById) return { applied: false, lines: 0 };
  const actor = { userId: input.requestedById };
  const project = await prisma.videoProject.findUniqueOrThrow({ where: { id: input.projectId }, include: { currentRevision: true } });
  const doc = parseTimeline(project.currentRevision!.documentJson);
  if (lyricLines(doc).length > 0) return { applied: false, lines: 0 };
  const lines = transcriptToLyricLines(input.transcript.segments);
  if (lines.length === 0) return { applied: false, lines: 0 };
  const result = await replaceUnlockedLyrics(actor, input.projectId, doc, input.audioAssetId, lines, 0, doc.revisionId, 'Letra transcrita (Whisper) — revisar', 'system');
  return { applied: true, lines: result.inserted };
}

/** Aplica a última transcrição sobre as linhas não validadas (ação do usuário). */
export async function applyLyricsTranscript(actor: Actor, projectId: string, input: { expectedRevisionId: string }) {
  const { lyrics, doc } = await loadLyricsContext(actor, projectId, 'project.edit');
  const transcript = await latestLyricsTranscript(lyrics.audioAssetId);
  if (!transcript) throw new DomainError('DEPENDENCY_MISSING', 'Ainda não há transcrição deste áudio. Peça a transcrição primeiro.');
  const lines = transcriptToLyricLines(transcript.segmentsJson as unknown as TranscribedSegment[]);
  return replaceUnlockedLyrics(actor, projectId, doc, lyrics.audioAssetId, lines, 0, input.expectedRevisionId, 'Transcrição aplicada (Whisper) — revisar');
}

/**
 * Regras do Lyrics antes de renderizar: mapa musical pronto; no final,
 * direitos declarados e letra sem erro de sincronização no trecho.
 */
export async function assertLyricsRenderable(projectId: string, doc: TimelineDocument, quality: 'preview' | 'final', range: { startFrame: number; endFrame: number } | null) {
  const lyrics = await findLyricsProject(projectId);
  if (!lyrics) return;
  if (!lyrics.musicalMapKey) throw new DomainError('DEPENDENCY_MISSING', 'A análise musical ainda não terminou. Aguarde ou peça a análise de novo.');
  if (quality !== 'final') return;
  if (!lyrics.rightsDeclaredAt) throw new DomainError('FORBIDDEN', 'Declare que você tem autorização para usar o áudio e a letra antes do render final.');
  const errors = lyricIssuesInTimeline(doc, range ?? undefined).filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    throw new DomainError('INVALID', `A letra tem ${errors.length} problema(s) no trecho: ${errors.slice(0, 3).map((e) => e.message).join('; ')}`, { issues: errors });
  }
}

