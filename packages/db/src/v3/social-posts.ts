/**
 * Central de mídias por canal: arquivos do canal e agenda de posts. A postagem
 * é manual: cada rede é marcada como postada por quem publicou; nenhum código
 * aqui envia conteúdo a uma plataforma.
 */
import type { Readable } from 'node:stream';
import {
  assertTransition,
  DomainError,
  SOCIAL_POST_TRANSITIONS,
  socialPostInputSchema,
  socialPostIssues,
  type SocialPlatformName,
  type SocialPostState,
} from '@editor-video/domain';
import type { Prisma } from '@prisma/client';
import { prisma } from '../client.js';
import { authorizeChannel, requireRole, type Actor } from './access.js';
import { kindForFile, registerAssetFromStream } from './assets.js';

const POST_INCLUDE = {
  media: {
    orderBy: { position: 'asc' },
    include: { asset: { select: { id: true, kind: true, status: true, originalName: true, storageKey: true, width: true, height: true, durationSec: true } } },
  },
  targets: { orderBy: { platform: 'asc' } },
} satisfies Prisma.SocialPostInclude;

const CHANNEL_MEDIA_KINDS = ['IMAGE', 'VIDEO', 'AUDIO'];
const POST_MEDIA_KINDS = ['IMAGE', 'VIDEO'];

export async function listChannelMedia(actor: Actor, channelId: string) {
  await authorizeChannel(actor, channelId, 'project.view');
  const links = await prisma.channelAsset.findMany({
    where: { channelId },
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: { asset: true },
  });
  return links.map((l) => l.asset);
}

/** Recebe o upload e coloca o arquivo no canal (mesmo hash = reaproveita o original). */
export async function uploadChannelMedia(
  actor: Actor,
  channelId: string,
  input: { originalName: string; mimeType?: string | null; stream: Readable; tmpDir: string; declaredSize?: bigint },
) {
  const channel = await authorizeChannel(actor, channelId, 'asset.upload');
  if (!CHANNEL_MEDIA_KINDS.includes(kindForFile(input.originalName))) {
    throw new DomainError('INVALID', 'A central de mídias aceita imagem, vídeo e áudio.');
  }
  const asset = await registerAssetFromStream(actor, { ...input, workspaceId: channel.workspaceId });
  await prisma.channelAsset.upsert({
    where: { channelId_assetId: { channelId, assetId: asset.id } },
    update: {},
    create: { channelId, assetId: asset.id },
  });
  return asset;
}

/** Tira o arquivo do canal. O original continua na Biblioteca do workspace. */
export async function removeChannelMedia(actor: Actor, channelId: string, assetId: string) {
  await authorizeChannel(actor, channelId, 'asset.upload');
  const inUse = await prisma.socialPostMedia.count({
    where: { assetId, post: { channelId, state: { in: ['DRAFT', 'SCHEDULED'] } } },
  });
  if (inUse > 0) throw new DomainError('CONFLICT', `Esta mídia está em ${inUse} post(s) em aberto; retire-a deles antes.`);
  await prisma.channelAsset.deleteMany({ where: { channelId, assetId } });
}

export async function listSocialPosts(actor: Actor, channelId: string, range: { from: Date; to: Date }) {
  await authorizeChannel(actor, channelId, 'project.view');
  const [posts, drafts, due] = await Promise.all([
    prisma.socialPost.findMany({
      where: { channelId, state: { in: ['SCHEDULED', 'POSTED'] }, scheduledAt: { gte: range.from, lt: range.to } },
      orderBy: { scheduledAt: 'asc' },
      include: POST_INCLUDE,
    }),
    prisma.socialPost.findMany({ where: { channelId, state: 'DRAFT' }, orderBy: { updatedAt: 'desc' }, include: POST_INCLUDE }),
    prisma.socialPost.findMany({
      where: { channelId, state: 'SCHEDULED', scheduledAt: { lte: new Date() } },
      orderBy: { scheduledAt: 'asc' },
      include: POST_INCLUDE,
    }),
  ]);
  return { posts, drafts, due };
}

async function assertUsableMedia(channelId: string, assetIds: string[]) {
  const links = await prisma.channelAsset.findMany({
    where: { channelId, assetId: { in: assetIds } },
    select: { asset: { select: { kind: true, originalName: true } } },
  });
  if (links.length !== assetIds.length) throw new DomainError('INVALID', 'Há mídia que não pertence a este canal.');
  const invalid = links.find((l) => !POST_MEDIA_KINDS.includes(l.asset.kind));
  if (invalid) throw new DomainError('INVALID', `${invalid.asset.originalName}: posts aceitam só imagem e vídeo.`);
}

function assertSchedulable(post: { title: string | null; caption: string; platforms: SocialPlatformName[]; mediaKinds: string[]; mediaStatus: string[] }) {
  const issues = socialPostIssues(post);
  if (post.mediaStatus.some((s) => s !== 'READY')) issues.push('Há mídia indisponível neste post.');
  if (issues.length > 0) throw new DomainError('INVALID', issues.join(' '), { issues });
}

const issuesSubject = (post: { title: string | null; caption: string; targets: Array<{ platform: string }>; media: Array<{ asset: { kind: string; status: string } }> }) => ({
  title: post.title,
  caption: post.caption,
  platforms: post.targets.map((t) => t.platform as SocialPlatformName),
  mediaKinds: post.media.map((m) => m.asset.kind),
  mediaStatus: post.media.map((m) => m.asset.status),
});

async function loadPost(actor: Actor, postId: string, action: 'project.edit' | 'publication.schedule') {
  const post = await prisma.socialPost.findUnique({ where: { id: postId }, include: { ...POST_INCLUDE, channel: { select: { workspaceId: true } } } });
  if (!post) throw new DomainError('NOT_FOUND', 'Post não encontrado.');
  await requireRole(actor, post.channel.workspaceId, action);
  return post;
}

function assertNothingPosted(post: { targets: Array<{ postedAt: Date | null }> }) {
  if (post.targets.some((t) => t.postedAt)) throw new DomainError('CONFLICT', 'Este post já saiu em alguma rede; desmarque a rede antes de alterá-lo.');
}

export async function createSocialPost(actor: Actor, channelId: string, raw: unknown) {
  await authorizeChannel(actor, channelId, 'project.edit');
  const input = socialPostInputSchema.parse(raw);
  await assertUsableMedia(channelId, input.assetIds);
  return prisma.socialPost.create({
    data: {
      channelId,
      title: input.title || null,
      caption: input.caption,
      notes: input.notes || null,
      createdById: actor.userId,
      targets: { create: input.platforms.map((platform) => ({ platform })) },
      media: { create: input.assetIds.map((assetId, position) => ({ assetId, position })) },
    },
    include: POST_INCLUDE,
  });
}

export async function updateSocialPost(actor: Actor, postId: string, raw: unknown) {
  const post = await loadPost(actor, postId, 'project.edit');
  if (post.state !== 'DRAFT' && post.state !== 'SCHEDULED') throw new DomainError('CONFLICT', 'Post encerrado não pode ser alterado.');
  assertNothingPosted(post);
  const input = socialPostInputSchema.parse(raw);
  await assertUsableMedia(post.channelId, input.assetIds);
  if (post.state === 'SCHEDULED') {
    const assets = await prisma.asset.findMany({ where: { id: { in: input.assetIds } }, select: { kind: true, status: true } });
    assertSchedulable({ title: input.title || null, caption: input.caption, platforms: input.platforms, mediaKinds: assets.map((a) => a.kind), mediaStatus: assets.map((a) => a.status) });
  }
  return prisma.socialPost.update({
    where: { id: postId },
    data: {
      title: input.title || null,
      caption: input.caption,
      notes: input.notes || null,
      targets: { deleteMany: {}, create: input.platforms.map((platform) => ({ platform })) },
      media: { deleteMany: {}, create: input.assetIds.map((assetId, position) => ({ assetId, position })) },
    },
    include: POST_INCLUDE,
  });
}

/** Coloca o post na agenda ou move o horário de um post já agendado. */
export async function scheduleSocialPost(actor: Actor, postId: string, scheduledAt: Date) {
  const post = await loadPost(actor, postId, 'publication.schedule');
  if (post.state !== 'SCHEDULED') assertTransition('Post', SOCIAL_POST_TRANSITIONS, post.state as SocialPostState, 'SCHEDULED');
  assertNothingPosted(post);
  if (scheduledAt.getTime() < Date.now() - 60_000) throw new DomainError('INVALID', 'Horário no passado.');
  assertSchedulable(issuesSubject(post));
  return prisma.socialPost.update({ where: { id: postId }, data: { state: 'SCHEDULED', scheduledAt }, include: POST_INCLUDE });
}

export async function unscheduleSocialPost(actor: Actor, postId: string) {
  const post = await loadPost(actor, postId, 'publication.schedule');
  assertTransition('Post', SOCIAL_POST_TRANSITIONS, post.state as SocialPostState, 'DRAFT');
  assertNothingPosted(post);
  return prisma.socialPost.update({ where: { id: postId }, data: { state: 'DRAFT', scheduledAt: null }, include: POST_INCLUDE });
}

export async function cancelSocialPost(actor: Actor, postId: string) {
  const post = await loadPost(actor, postId, 'publication.schedule');
  assertTransition('Post', SOCIAL_POST_TRANSITIONS, post.state as SocialPostState, 'CANCELLED');
  assertNothingPosted(post);
  return prisma.socialPost.update({ where: { id: postId }, data: { state: 'CANCELLED' }, include: POST_INCLUDE });
}

/** Registra (ou desfaz) a postagem manual em uma rede; todas marcadas = post concluído. */
export async function setSocialPostTargetPosted(actor: Actor, postId: string, input: { platform: SocialPlatformName; posted: boolean; remoteUrl?: string | null }) {
  await loadPost(actor, postId, 'publication.schedule');
  return prisma.$transaction(async (tx) => {
    // Duas redes marcadas ao mesmo tempo não podem deixar o estado do post defasado.
    await tx.$queryRaw`SELECT id FROM "SocialPost" WHERE id = ${postId} FOR UPDATE`;
    const post = await tx.socialPost.findUniqueOrThrow({ where: { id: postId }, include: { targets: true } });
    if (post.state !== 'SCHEDULED' && post.state !== 'POSTED') throw new DomainError('CONFLICT', 'Só posts agendados podem ser marcados como postados.');
    const target = post.targets.find((t) => t.platform === input.platform);
    if (!target) throw new DomainError('NOT_FOUND', 'Esta rede não faz parte do post.');
    const now = new Date();
    await tx.socialPostTarget.update({
      where: { id: target.id },
      data: input.posted ? { postedAt: target.postedAt ?? now, remoteUrl: input.remoteUrl ?? target.remoteUrl } : { postedAt: null, remoteUrl: null },
    });
    const allPosted = input.posted && post.targets.every((t) => t.id === target.id || t.postedAt);
    const state = allPosted ? 'POSTED' : 'SCHEDULED';
    if (state !== post.state) assertTransition('Post', SOCIAL_POST_TRANSITIONS, post.state as SocialPostState, state);
    return tx.socialPost.update({ where: { id: postId }, data: { state, postedAt: allPosted ? now : null }, include: POST_INCLUDE });
  });
}
