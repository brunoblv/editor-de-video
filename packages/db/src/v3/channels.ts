/**
 * Workspaces e canais (RF-01). Os canais preservados são semeados a partir
 * de @editor-video/domain; editar um canal nunca toca outro canal nem
 * projetos existentes (revisões fixam identidade/template por versão).
 */
import { buildChannelSeeds, channelRulesSchema, DomainError, type ChannelSeed } from '@editor-video/domain';
import type { Prisma } from '@prisma/client';
import { prisma } from '../client.js';
import { requireRole, type Actor } from './access.js';

const json = (v: unknown) => v as Prisma.InputJsonValue;

/** Garante um workspace pessoal para o usuário (primeiro acesso à V3). */
export async function ensureWorkspaceForUser(userId: string, name: string): Promise<string> {
  const existing = await prisma.membership.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
  if (existing) return existing.workspaceId;
  const workspace = await prisma.workspace.create({
    data: { name, memberships: { create: { userId, role: 'OWNER' } } },
  });
  await seedChannels(workspace.id);
  return workspace.id;
}

/** Upsert idempotente de um canal-semente com brand kit v1, séries e templates v1. */
export async function upsertChannelSeed(workspaceId: string, seed: ChannelSeed, ids?: { channelId?: string }) {
  const channel = await prisma.channel.upsert({
    where: { workspaceId_slug: { workspaceId, slug: seed.slug } },
    update: {},
    create: {
      ...(ids?.channelId ? { id: ids.channelId } : {}),
      workspaceId,
      slug: seed.slug,
      name: seed.name,
      nameConfirmed: seed.nameConfirmed,
      tagline: seed.tagline,
      languages: seed.languages,
      rulesJson: json(seed.rules),
      domainJson: json(seed.domain),
      linkedBrand: seed.linkedBrand,
    },
  });
  await prisma.brandKitVersion.upsert({
    where: { channelId_version: { channelId: channel.id, version: 1 } },
    update: {},
    create: { channelId: channel.id, version: 1, colorsJson: json(seed.brandKit.colors), fonts: seed.brandKit.fonts },
  });
  for (const series of seed.series) {
    await prisma.series.upsert({
      where: { channelId_slug: { channelId: channel.id, slug: series.slug } },
      update: {},
      create: { channelId: channel.id, slug: series.slug, name: series.name, legacyKind: series.legacyKind ?? null, configJson: json(series.config) },
    });
  }
  for (const template of seed.templates) {
    await prisma.templateVersion.upsert({
      where: { channelId_slug_version: { channelId: channel.id, slug: template.slug, version: 1 } },
      update: {},
      create: {
        channelId: channel.id,
        slug: template.slug,
        version: 1,
        name: template.name,
        engine: template.engine,
        paramsSchemaJson: json(template.paramsSchema),
        defaultsJson: json(template.defaults),
      },
    });
  }
  const character = (seed.domain as { character?: Record<string, unknown> }).character;
  if (character) {
    await prisma.characterProfile.upsert({
      where: { channelId_slug: { channelId: channel.id, slug: seed.slug } },
      update: {},
      create: { channelId: channel.id, slug: seed.slug, name: String(character.name ?? seed.name), profileJson: json(character), assetsVerified: false },
    });
  }
  return channel;
}

export async function seedChannels(workspaceId: string) {
  const channels = [];
  for (const seed of buildChannelSeeds()) channels.push(await upsertChannelSeed(workspaceId, seed));
  return channels;
}

export async function listChannels(actor: Actor, workspaceId?: string) {
  const memberships = await prisma.membership.findMany({ where: { userId: actor.userId } });
  const ids = memberships.map((m) => m.workspaceId).filter((id) => !workspaceId || id === workspaceId);
  return prisma.channel.findMany({
    where: { workspaceId: { in: ids } },
    orderBy: { name: 'asc' },
    include: {
      series: { where: { active: true }, orderBy: { name: 'asc' } },
      accounts: { select: { id: true, platform: true, displayName: true, status: true, isTestAccount: true } },
      _count: { select: { projects: true } },
    },
  });
}

export async function getChannel(actor: Actor, channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      series: { orderBy: { name: 'asc' } },
      templates: { orderBy: [{ slug: 'asc' }, { version: 'desc' }] },
      brandKits: { orderBy: { version: 'desc' }, take: 1 },
      characters: true,
      accounts: { select: { id: true, platform: true, displayName: true, externalId: true, status: true, isTestAccount: true, tokenExpiresAt: true } },
    },
  });
  if (!channel) throw new DomainError('NOT_FOUND', 'Canal não encontrado.');
  await requireRole(actor, channel.workspaceId, 'project.view');
  return channel;
}

export type ChannelUpdate = {
  name?: string;
  nameConfirmed?: boolean;
  tagline?: string | null;
  languages?: string[];
  rules?: unknown;
  linkedBrand?: string | null;
  active?: boolean;
  brandKit?: { colors: Record<string, string>; fonts: string[] };
};

/** Atualiza só este canal. Novo brand kit = nova versão imutável. */
export async function updateChannel(actor: Actor, channelId: string, update: ChannelUpdate) {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new DomainError('NOT_FOUND', 'Canal não encontrado.');
  await requireRole(actor, channel.workspaceId, 'channel.manage');
  const rules = update.rules !== undefined ? channelRulesSchema.parse(update.rules) : undefined;
  return prisma.$transaction(async (tx) => {
    if (update.brandKit) {
      const last = await tx.brandKitVersion.findFirst({ where: { channelId }, orderBy: { version: 'desc' } });
      await tx.brandKitVersion.create({
        data: { channelId, version: (last?.version ?? 0) + 1, colorsJson: json(update.brandKit.colors), fonts: update.brandKit.fonts },
      });
    }
    return tx.channel.update({
      where: { id: channelId },
      data: {
        ...(update.name !== undefined ? { name: update.name } : {}),
        ...(update.nameConfirmed !== undefined ? { nameConfirmed: update.nameConfirmed } : {}),
        ...(update.tagline !== undefined ? { tagline: update.tagline } : {}),
        ...(update.languages !== undefined ? { languages: update.languages } : {}),
        ...(rules ? { rulesJson: json(rules) } : {}),
        ...(update.linkedBrand !== undefined ? { linkedBrand: update.linkedBrand } : {}),
        ...(update.active !== undefined ? { active: update.active } : {}),
      },
    });
  });
}

export async function createChannel(actor: Actor, workspaceId: string, input: { slug: string; name: string; languages: string[] }) {
  await requireRole(actor, workspaceId, 'channel.manage');
  if (!/^[a-z0-9-]{2,60}$/.test(input.slug)) throw new DomainError('INVALID', 'Slug deve ter letras minúsculas, números e hífens.');
  return prisma.channel.create({
    data: {
      workspaceId,
      slug: input.slug,
      name: input.name,
      languages: input.languages,
      rulesJson: json(channelRulesSchema.parse({})),
      domainJson: json({}),
      brandKits: { create: { version: 1, colorsJson: json({}), fonts: [] } },
    },
  });
}
