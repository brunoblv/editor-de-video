/**
 * Biblioteca de assets (RF-03 / RF-05, §11): original imutável endereçado
 * por hash, deduplicado por workspace, com metadados, origem e licença.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { getStorage } from '@editor-video/core/server';
import { DomainError } from '@editor-video/domain';
import { hashFile, inspectMedia, type MediaInfo } from '@editor-video/integrations';
import { parseItem, type AssetRef, type TimelineDocument } from '@editor-video/timeline';
import type { Asset, AssetKind, Prisma } from '@prisma/client';
import { prisma } from '../client.js';
import { authorizeAsset, listWorkspaceIds, requireRole, type Actor } from './access.js';
import { commitDocument } from './projects.js';

const json = (v: unknown) => v as Prisma.InputJsonValue;

export const UPLOAD_LIMITS = {
  maxBytes: BigInt(process.env.MAX_UPLOAD_BYTES ?? String(20 * 1024 ** 3)),
  minFreeBytes: BigInt(process.env.MIN_FREE_DISK_BYTES ?? String(5 * 1024 ** 3)),
};

const EXT_KIND: Record<string, AssetKind> = {
  '.mp4': 'VIDEO', '.mov': 'VIDEO', '.mkv': 'VIDEO', '.webm': 'VIDEO', '.m4v': 'VIDEO',
  '.wav': 'AUDIO', '.mp3': 'AUDIO', '.m4a': 'AUDIO', '.flac': 'AUDIO', '.ogg': 'AUDIO', '.aac': 'AUDIO',
  '.png': 'IMAGE', '.jpg': 'IMAGE', '.jpeg': 'IMAGE', '.webp': 'IMAGE',
  '.ttf': 'FONT', '.otf': 'FONT', '.woff2': 'FONT',
};

export function kindForFile(name: string): AssetKind {
  const kind = EXT_KIND[path.extname(name).toLowerCase()];
  if (!kind) throw new DomainError('INVALID', `Tipo de arquivo não suportado: ${path.extname(name) || name}`);
  return kind;
}

export async function assertDiskSpace(dir: string, incoming: bigint): Promise<void> {
  try {
    const stat = await fsp.statfs(dir);
    const free = BigInt(stat.bavail) * BigInt(stat.bsize);
    if (free - incoming < UPLOAD_LIMITS.minFreeBytes) throw new DomainError('LIMIT', 'Espaço em disco insuficiente para o upload.');
  } catch (err) {
    if (err instanceof DomainError) throw err;
  }
}

export type RegisterInput = {
  workspaceId: string;
  localPath: string;
  originalName: string;
  mimeType?: string | null;
  provider?: string | null;
  sourceUrl?: string | null;
  author?: string | null;
  license?: string | null;
  attribution?: string | null;
  tags?: string[];
};

/**
 * Registra um arquivo local já recebido: hash → dedupe → storage → inspeção.
 * Se o mesmo conteúdo já existe no workspace, devolve o asset existente.
 */
export async function registerAssetFromFile(actor: Actor, input: RegisterInput): Promise<Asset> {
  await requireRole(actor, input.workspaceId, 'asset.upload');
  const kind = kindForFile(input.originalName);
  const stat = await fsp.stat(input.localPath);
  if (BigInt(stat.size) > UPLOAD_LIMITS.maxBytes) throw new DomainError('LIMIT', 'Arquivo acima do limite de upload.');

  const sha256 = await hashFile(input.localPath);
  const existing = await prisma.asset.findUnique({ where: { workspaceId_sha256: { workspaceId: input.workspaceId, sha256 } } });
  if (existing) return existing;

  let info: MediaInfo | null = null;
  if (kind === 'VIDEO' || kind === 'AUDIO' || kind === 'IMAGE') {
    try {
      info = await inspectMedia(input.localPath);
    } catch (err) {
      throw new DomainError('INVALID', `Arquivo não decodificável: ${(err as Error).message.slice(0, 300)}`);
    }
    if (kind === 'VIDEO' && !info.video) throw new DomainError('INVALID', 'Vídeo sem stream de imagem.');
    if (kind === 'AUDIO' && !info.audio) throw new DomainError('INVALID', 'Áudio sem stream de som.');
  }

  const storageKey = `assets/${input.workspaceId}/${sha256}${path.extname(input.originalName).toLowerCase()}`;
  const storage = getStorage();
  if (!(await storage.exists(storageKey))) {
    const { createReadStream } = await import('node:fs');
    await storage.put(storageKey, createReadStream(input.localPath));
  }

  return prisma.asset.create({
    data: {
      workspaceId: input.workspaceId,
      kind,
      status: 'READY',
      sha256,
      storageKey,
      originalName: input.originalName.slice(0, 255),
      mimeType: input.mimeType ?? null,
      sizeBytes: BigInt(stat.size),
      durationSec: info?.durationSec ?? null,
      width: info?.video?.displayWidth ?? null,
      height: info?.video?.displayHeight ?? null,
      fpsNum: info?.video?.fpsNum ?? null,
      fpsDen: info?.video?.fpsDen ?? null,
      hasAudio: Boolean(info?.audio),
      mediaInfoJson: info ? json({ ...info, sizeBytes: info.sizeBytes.toString() }) : undefined,
      provider: input.provider ?? 'upload',
      sourceUrl: input.sourceUrl ?? null,
      author: input.author ?? null,
      license: input.license ?? null,
      attribution: input.attribution ?? null,
      tags: input.tags ?? [],
    },
  });
}

/** Recebe um stream (upload HTTP) em arquivo temporário e registra. */
export async function registerAssetFromStream(actor: Actor, input: Omit<RegisterInput, 'localPath'> & { stream: Readable; tmpDir: string; declaredSize?: bigint }) {
  await requireRole(actor, input.workspaceId, 'asset.upload');
  kindForFile(input.originalName);
  if (input.declaredSize && input.declaredSize > UPLOAD_LIMITS.maxBytes) throw new DomainError('LIMIT', 'Arquivo acima do limite de upload.');
  await fsp.mkdir(input.tmpDir, { recursive: true });
  await assertDiskSpace(input.tmpDir, input.declaredSize ?? 0n);
  const tmp = path.join(input.tmpDir, `upload-${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(input.originalName)}`);
  const { createWriteStream } = await import('node:fs');
  const { pipeline } = await import('node:stream/promises');
  let received = 0n;
  try {
    await pipeline(
      input.stream,
      async function* limit(source: AsyncIterable<Buffer>) {
        for await (const chunk of source) {
          received += BigInt(chunk.length);
          if (received > UPLOAD_LIMITS.maxBytes) throw new DomainError('LIMIT', 'Arquivo acima do limite de upload.');
          yield chunk;
        }
      },
      createWriteStream(tmp),
    );
    return await registerAssetFromFile(actor, { ...input, localPath: tmp });
  } finally {
    await fsp.rm(tmp, { force: true });
  }
}

export async function listAssets(actor: Actor, filter: { workspaceId?: string; kind?: AssetKind; q?: string; take?: number; cursor?: string } = {}) {
  const ids = (await listWorkspaceIds(actor)).filter((id) => !filter.workspaceId || id === filter.workspaceId);
  return prisma.asset.findMany({
    where: {
      workspaceId: { in: ids },
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.q ? { OR: [{ originalName: { contains: filter.q, mode: 'insensitive' } }, { tags: { has: filter.q } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(filter.take ?? 60, 200),
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
  });
}

/** Referência imutável do asset para a timeline (hash + timebase da fonte). */
export function assetToRef(asset: Asset): AssetRef {
  if (!asset.sha256) throw new DomainError('DEPENDENCY_MISSING', `Asset ${asset.id} sem hash (ainda em análise).`);
  const info = asset.mediaInfoJson as { audio?: { sampleRate?: number } } | null;
  if (asset.kind === 'VIDEO') {
    const num = asset.fpsNum ?? 30;
    const den = asset.fpsDen ?? 1;
    return {
      assetId: asset.id,
      hash: asset.sha256,
      kind: 'video',
      sourceTimebase: { num, den },
      durationUnits: asset.durationSec != null ? Math.floor((asset.durationSec * num) / den) : undefined,
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
      hasAudio: asset.hasAudio,
    };
  }
  if (asset.kind === 'AUDIO') {
    const rate = info?.audio?.sampleRate || 48000;
    return {
      assetId: asset.id,
      hash: asset.sha256,
      kind: 'audio',
      sourceTimebase: { num: rate, den: 1 },
      durationUnits: asset.durationSec != null ? Math.floor(asset.durationSec * rate) : undefined,
      hasAudio: true,
    };
  }
  if (asset.kind === 'IMAGE' || asset.kind === 'CHARACTER') {
    return { assetId: asset.id, hash: asset.sha256, kind: 'image', sourceTimebase: { num: 1, den: 1 }, width: asset.width ?? undefined, height: asset.height ?? undefined, hasAudio: false };
  }
  throw new DomainError('INVALID', `Asset ${asset.kind} não entra na timeline como clipe.`);
}

/**
 * Adiciona o asset ao inventário da timeline e, opcionalmente, um clipe no
 * fim da trilha (vídeo/imagem → V1, áudio → A1).
 */
export async function addAssetToProject(actor: Actor, projectId: string, assetId: string, expectedRevisionId: string, options: { append?: boolean; trackId?: string; imageDurationSec?: number } = {}) {
  const asset = await authorizeAsset(actor, assetId, 'project.view');
  const project = await prisma.videoProject.findUnique({ where: { id: projectId } });
  if (!project || project.workspaceId !== asset.workspaceId) throw new DomainError('NOT_FOUND', 'Projeto não encontrado.');
  const ref = assetToRef(asset);
  return commitDocument(
    actor,
    projectId,
    expectedRevisionId,
    (doc: TimelineDocument) => {
      doc.assets[ref.assetId] = ref;
      if (options.append !== false) {
        const trackId = options.trackId ?? (ref.kind === 'audio' ? 'A1' : 'V1');
        const track = doc.tracks.find((t) => t.id === trackId);
        if (!track) throw new DomainError('INVALID', `Trilha ${trackId} não existe.`);
        const fps = { num: doc.video.fpsNumerator, den: doc.video.fpsDenominator };
        const start = track.items.reduce((end, i) => Math.max(end, i.timelineStart + i.duration), 0);
        const id = `${ref.kind === 'audio' ? 'a' : 'c'}-${Date.now().toString(36)}`;
        if (ref.kind === 'image') {
          const frames = Math.round(((options.imageDurationSec ?? 5) * fps.num) / fps.den);
          track.items.push(parseItem({ id, kind: 'clip', assetId: ref.assetId, sourceIn: 0, sourceOut: 1, timelineStart: start, duration: frames }));
        } else {
          const units = ref.durationUnits ?? 0;
          if (units <= 0) throw new DomainError('INVALID', 'Asset sem duração conhecida.');
          const duration = Math.round((units * ref.sourceTimebase.den * fps.num) / (ref.sourceTimebase.num * fps.den));
          track.items.push(parseItem({ id, kind: 'clip', assetId: ref.assetId, sourceIn: 0, sourceOut: units, timelineStart: start, duration }));
        }
        doc.video.durationFrames = Math.max(...doc.tracks.flatMap((t) => t.items.map((i) => i.timelineStart + i.duration)), 0);
      }
      return doc;
    },
    `Adicionado ${asset.originalName}`,
  );
}

/** Caminho local do original ou do proxy (render usa original; player usa proxy). */
export async function resolveAssetPath(assetId: string, useProxy: boolean): Promise<{ path: string; kind: string; originalName: string }> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new DomainError('NOT_FOUND', `Asset ${assetId} ausente.`);
  const storage = getStorage();
  const key = useProxy && asset.proxyKey ? asset.proxyKey : asset.storageKey;
  if (!(await storage.exists(key))) {
    await prisma.asset.update({ where: { id: assetId }, data: { status: 'MISSING' } });
    throw new DomainError('DEPENDENCY_MISSING', `Arquivo do asset ${asset.originalName} está ausente no storage.`);
  }
  return { path: await storage.toLocalPath(key), kind: asset.kind.toLowerCase(), originalName: asset.originalName };
}
