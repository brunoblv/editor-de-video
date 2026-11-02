/**
 * Planejador da migração legado → V3 (§18). Função PURA: recebe um retrato
 * do banco legado e devolve um plano determinístico com IDs estáveis.
 * O executor (packages/db) aplica o plano com upserts + LegacyMapping, o que
 * torna a execução repetível sem duplicar dados (AC-01).
 *
 * Princípios aplicados:
 * - Isolamento preservado: no legado cada usuário só via os próprios
 *   projetos; por isso cada usuário vira dono de um workspace próprio.
 * - Registros sem userId ficam pendentes de associação (nunca públicos).
 * - TOP_LIST/CURIOSIDADE sem mapeamento explícito ficam pendentes.
 * - Agendamentos migram pausados; publicações com ID remoto viram históricas.
 * - Contas sociais não ganham canal implicitamente.
 */
import { buildChannelSeeds, type ChannelSeed } from './channels.js';
import { stableId } from './hashing.js';

export type LegacyKind = 'TOP_LIST' | 'CURIOSIDADE' | 'AMBIENT' | 'CHRISTIAN' | 'RABISCO';

export type LegacyUser = { id: string; email: string; name: string | null };

export type LegacyProject = {
  id: string;
  title: string;
  kind: LegacyKind;
  status: string;
  userId: string | null;
  outputKey: string | null;
  outputSizeByte: number | null;
  previewKey: string | null;
  renderedAt: Date | string | null;
  scheduledAt: Date | string | null;
  youtubeVideoId: string | null;
  youtubeShortId: string | null;
  publishedAt: Date | string | null;
  verseId: string | null;
  recipeId: string | null;
  parentProjectId: string | null;
  createdAt: Date | string;
};

export type LegacyClip = {
  id: string;
  projectId: string;
  originalName: string;
  sourceKey: string;
  sizeByte: number;
  sourceDurationSec: number | null;
};

export type LegacyMediaAsset = {
  id: string;
  projectId: string;
  provider: string;
  sourceUrl: string;
  author: string | null;
  license: string | null;
  localKey: string | null;
};

export type LegacySoundAsset = {
  id: string;
  name: string;
  category: string;
  provider: string;
  sourceUrl: string | null;
  localKey: string;
  license: string | null;
  licenseVerdict: string;
  attribution: string | null;
};

export type LegacyYouTubeChannel = {
  id: string;
  userId: string;
  channelId: string;
  channelTitle: string | null;
  hasPlaylistMap: boolean;
};

export type LegacyRecipe = { id: string; versions: number[] };

export type LegacySnapshot = {
  /** Branch/commit de referência do legado (§18.1). */
  sourceRef: string;
  users: LegacyUser[];
  projects: LegacyProject[];
  clips: LegacyClip[];
  mediaAssets: LegacyMediaAsset[];
  soundAssets: LegacySoundAsset[];
  youtubeChannels: LegacyYouTubeChannel[];
  recipes: LegacyRecipe[];
  bibleVerseCount: number;
};

export type MigrationOptions = {
  /** Usuário cujo workspace recebe todos os canais e a biblioteca compartilhada. */
  primaryUserId?: string;
  /** Mapeamento explícito projeto → slug de canal (TOP_LIST/CURIOSIDADE). */
  projectChannelOverrides?: Record<string, string>;
  /** Associação explícita conta YouTube legada → slug de canal. */
  socialAccountChannelOverrides?: Record<string, string>;
};

export type PlanTarget =
  | 'Workspace'
  | 'Membership'
  | 'Channel'
  | 'Series'
  | 'BrandKitVersion'
  | 'TemplateVersion'
  | 'SocialAccount'
  | 'Asset'
  | 'AssetUsage'
  | 'VideoProject'
  | 'Deliverable'
  | 'Publication'
  | 'VerseUsage'
  | 'RecipeChannelLink'
  | 'CharacterProfile';

export type PlanEntry = {
  sourceTable: string;
  sourceId: string;
  targetTable: PlanTarget;
  targetId: string;
  data: Record<string, unknown>;
};

export type PendingItem = {
  sourceTable: string;
  sourceId: string;
  reason:
    | 'NO_OWNER'
    | 'NO_CHANNEL_MAPPING'
    | 'SOCIAL_ACCOUNT_UNLINKED'
    | 'SCHEDULE_PAUSED'
    | 'MISSING_FILE'
    | 'EDIT_NOT_CONVERTIBLE';
  detail: string;
};

export type MigrationPlan = {
  sourceRef: string;
  entries: PlanEntry[];
  pending: PendingItem[];
  counts: Record<string, { source: number; planned: number; pending: number }>;
};

const KIND_TO_CHANNEL: Partial<Record<LegacyKind, string>> = {
  AMBIENT: 'midnight-relaxing-sounds',
  CHRISTIAN: 'canal-cristao',
  RABISCO: 'rabisco',
};

const iso = (v: Date | string | null) => (v == null ? null : new Date(v).toISOString());

export function planMigration(snapshot: LegacySnapshot, options: MigrationOptions = {}): MigrationPlan {
  const entries: PlanEntry[] = [];
  const pending: PendingItem[] = [];
  const seeds = buildChannelSeeds();
  const primaryUserId = options.primaryUserId ?? snapshot.users[0]?.id;

  const workspaceId = (userId: string) => stableId('ws', 'user', userId);
  const channelId = (wsId: string, slug: string) => stableId('ch', wsId, slug);
  const push = (e: PlanEntry) => entries.push(e);

  // 1. Workspaces e memberships (um por usuário, preservando o isolamento).
  for (const user of snapshot.users) {
    const ws = workspaceId(user.id);
    push({
      sourceTable: 'User',
      sourceId: user.id,
      targetTable: 'Workspace',
      targetId: ws,
      data: { name: user.name ? `Workspace de ${user.name}` : user.email, ownerUserId: user.id },
    });
    push({
      sourceTable: 'User',
      sourceId: user.id,
      targetTable: 'Membership',
      targetId: stableId('mem', ws, user.id),
      data: { workspaceId: ws, userId: user.id, role: 'OWNER' },
    });
  }

  // 2. Canais: no workspace principal, todos; nos demais, os que têm projetos.
  const kindsByUser = new Map<string, Set<LegacyKind>>();
  for (const p of snapshot.projects) {
    if (!p.userId) continue;
    const set = kindsByUser.get(p.userId) ?? new Set();
    set.add(p.kind);
    kindsByUser.set(p.userId, set);
  }
  const channelsByWorkspace = new Map<string, Set<string>>();
  const addChannel = (userId: string, seed: ChannelSeed) => {
    const ws = workspaceId(userId);
    const set = channelsByWorkspace.get(ws) ?? new Set<string>();
    if (set.has(seed.slug)) return;
    set.add(seed.slug);
    channelsByWorkspace.set(ws, set);
    const ch = channelId(ws, seed.slug);
    push({
      sourceTable: 'ChannelSeed',
      sourceId: `${userId}:${seed.slug}`,
      targetTable: 'Channel',
      targetId: ch,
      data: { workspaceId: ws, slug: seed.slug },
    });
    push({
      sourceTable: 'ChannelSeed',
      sourceId: `${userId}:${seed.slug}:brand`,
      targetTable: 'BrandKitVersion',
      targetId: stableId('bk', ch, '1'),
      data: { channelId: ch, version: 1 },
    });
    for (const series of seed.series) {
      push({
        sourceTable: 'ChannelSeed',
        sourceId: `${userId}:${seed.slug}:series:${series.slug}`,
        targetTable: 'Series',
        targetId: stableId('se', ch, series.slug),
        data: { channelId: ch, slug: series.slug },
      });
    }
    for (const template of seed.templates) {
      push({
        sourceTable: 'ChannelSeed',
        sourceId: `${userId}:${seed.slug}:template:${template.slug}`,
        targetTable: 'TemplateVersion',
        targetId: stableId('tv', ch, template.slug, '1'),
        data: { channelId: ch, slug: template.slug, version: 1 },
      });
    }
    if (seed.slug === 'rabisco') {
      push({
        sourceTable: 'ChannelSeed',
        sourceId: `${userId}:rabisco:character`,
        targetTable: 'CharacterProfile',
        targetId: stableId('cp', ch, 'rabisco'),
        data: { channelId: ch, slug: 'rabisco' },
      });
    }
  };
  for (const user of snapshot.users) {
    const kinds = kindsByUser.get(user.id) ?? new Set();
    for (const seed of seeds) {
      if (user.id === primaryUserId || seed.legacyKinds.some((k) => k && kinds.has(k))) addChannel(user.id, seed);
    }
  }

  // 3. Receitas Midnight continuam nas tabelas existentes, vinculadas ao canal do workspace principal.
  if (primaryUserId) {
    const ch = channelId(workspaceId(primaryUserId), 'midnight-relaxing-sounds');
    for (const recipe of snapshot.recipes) {
      push({
        sourceTable: 'Recipe',
        sourceId: recipe.id,
        targetTable: 'RecipeChannelLink',
        targetId: recipe.id,
        data: { channelId: ch, versions: recipe.versions },
      });
    }
  }

  // 4. Biblioteca de sons: acervo compartilhado no workspace principal.
  if (primaryUserId) {
    const ws = workspaceId(primaryUserId);
    for (const sound of snapshot.soundAssets) {
      push({
        sourceTable: 'SoundAsset',
        sourceId: sound.id,
        targetTable: 'Asset',
        targetId: stableId('as', 'sound', sound.id),
        data: {
          workspaceId: ws,
          kind: 'audio',
          storageKey: sound.localKey,
          originalName: sound.name,
          provider: sound.provider,
          sourceUrl: sound.sourceUrl,
          license: sound.license,
          licenseVerdict: sound.licenseVerdict,
          attribution: sound.attribution,
          tags: [sound.category],
          /** O executor calcula o hash lendo o arquivo (stream). */
          needsHash: true,
        },
      });
    }
  }

  // 5. Contas sociais: preservam ID externo; canal só por associação explícita.
  for (const yt of snapshot.youtubeChannels) {
    const ws = workspaceId(yt.userId);
    const accountId = stableId('sa', ws, 'youtube', yt.channelId);
    const linkedSlug = options.socialAccountChannelOverrides?.[yt.id];
    push({
      sourceTable: 'YouTubeChannel',
      sourceId: yt.id,
      targetTable: 'SocialAccount',
      targetId: accountId,
      data: {
        workspaceId: ws,
        platform: 'YOUTUBE',
        externalId: yt.channelId,
        displayName: yt.channelTitle,
        channelId: linkedSlug ? channelId(ws, linkedSlug) : null,
        legacyYouTubeChannelId: yt.id,
      },
    });
    if (!linkedSlug) {
      pending.push({
        sourceTable: 'YouTubeChannel',
        sourceId: yt.id,
        reason: 'SOCIAL_ACCOUNT_UNLINKED',
        detail: `Conta ${yt.channelTitle ?? yt.channelId} migrada sem canal editorial${yt.hasPlaylistMap ? ' (tem playlists Midnight — provável Midnight, confirmar)' : ''}.`,
      });
    }
  }

  // 6. Projetos, assets, entregas, publicações e uso de versículos.
  const clipsByProject = groupBy(snapshot.clips, (c) => c.projectId);
  const mediaByProject = groupBy(snapshot.mediaAssets, (m) => m.projectId);
  const accountByUser = new Map(snapshot.youtubeChannels.map((yt) => [yt.userId, yt]));

  for (const project of snapshot.projects) {
    if (!project.userId) {
      pending.push({ sourceTable: 'Project', sourceId: project.id, reason: 'NO_OWNER', detail: `"${project.title}" sem userId — aguarda associação.` });
      continue;
    }
    const ws = workspaceId(project.userId);
    const slug = options.projectChannelOverrides?.[project.id] ?? KIND_TO_CHANNEL[project.kind];
    if (!slug) {
      pending.push({
        sourceTable: 'Project',
        sourceId: project.id,
        reason: 'NO_CHANNEL_MAPPING',
        detail: `"${project.title}" (${project.kind}) precisa de mapeamento explícito para um canal.`,
      });
      continue;
    }
    if (!channelsByWorkspace.get(ws)?.has(slug)) {
      const seed = seeds.find((s) => s.slug === slug);
      if (seed) addChannel(project.userId, seed);
    }
    const ch = channelId(ws, slug);
    const vp = stableId('vp', project.id);
    push({
      sourceTable: 'Project',
      sourceId: project.id,
      targetTable: 'VideoProject',
      targetId: vp,
      data: {
        workspaceId: ws,
        channelId: ch,
        title: project.title,
        legacyKind: project.kind,
        legacyProjectId: project.id,
        // Sem conversor testado da edição Remotion → somente leitura (§18.9).
        legacyReadOnly: true,
        state: 'ARCHIVED',
        createdAt: iso(project.createdAt),
      },
    });
    pending.push({
      sourceTable: 'Project',
      sourceId: project.id,
      reason: 'EDIT_NOT_CONVERTIBLE',
      detail: 'Edição legada preservada como snapshot JSON; projeto somente leitura até haver conversão testada.',
    });

    for (const clip of clipsByProject.get(project.id) ?? []) {
      const asset = stableId('as', 'clip', clip.id);
      push({
        sourceTable: 'Clip',
        sourceId: clip.id,
        targetTable: 'Asset',
        targetId: asset,
        data: { workspaceId: ws, kind: 'video', storageKey: clip.sourceKey, originalName: clip.originalName, sizeBytes: String(clip.sizeByte), provider: 'upload', needsHash: true },
      });
      push({ sourceTable: 'Clip', sourceId: clip.id, targetTable: 'AssetUsage', targetId: stableId('au', asset, vp), data: { assetId: asset, projectId: vp } });
    }
    for (const media of mediaByProject.get(project.id) ?? []) {
      if (!media.localKey) {
        pending.push({ sourceTable: 'MediaAsset', sourceId: media.id, reason: 'MISSING_FILE', detail: `Sem arquivo local (${media.sourceUrl}).` });
        continue;
      }
      const asset = stableId('as', 'media', media.id);
      push({
        sourceTable: 'MediaAsset',
        sourceId: media.id,
        targetTable: 'Asset',
        targetId: asset,
        data: { workspaceId: ws, kind: 'video', storageKey: media.localKey, provider: media.provider, sourceUrl: media.sourceUrl, author: media.author, license: media.license, needsHash: true },
      });
      push({ sourceTable: 'MediaAsset', sourceId: media.id, targetTable: 'AssetUsage', targetId: stableId('au', asset, vp), data: { assetId: asset, projectId: vp } });
    }

    const deliverables: Record<'final' | 'preview', string | null> = { final: null, preview: null };
    if (project.outputKey) {
      deliverables.final = stableId('dl', project.id, 'final');
      push({
        sourceTable: 'Project.outputKey',
        sourceId: project.id,
        targetTable: 'Deliverable',
        targetId: deliverables.final,
        data: { projectId: vp, kind: 'FINAL', storageKey: project.outputKey, sizeBytes: project.outputSizeByte != null ? String(project.outputSizeByte) : null, state: 'READY', origin: 'LEGACY', createdAt: iso(project.renderedAt), needsHash: true },
      });
    }
    if (project.previewKey) {
      deliverables.preview = stableId('dl', project.id, 'preview');
      push({
        sourceTable: 'Project.previewKey',
        sourceId: project.id,
        targetTable: 'Deliverable',
        targetId: deliverables.preview,
        data: { projectId: vp, kind: 'PREVIEW', storageKey: project.previewKey, state: 'READY', origin: 'LEGACY', needsHash: true },
      });
    }

    const yt = accountByUser.get(project.userId);
    const accountId = yt ? stableId('sa', ws, 'youtube', yt.channelId) : null;
    for (const [field, remoteId] of [
      ['youtubeVideoId', project.youtubeVideoId],
      ['youtubeShortId', project.youtubeShortId],
    ] as const) {
      if (!remoteId) continue;
      push({
        sourceTable: `Project.${field}`,
        sourceId: project.id,
        targetTable: 'Publication',
        targetId: stableId('pb', project.id, field),
        data: {
          projectId: vp,
          deliverableId: deliverables.final,
          socialAccountId: accountId,
          platform: 'YOUTUBE',
          remoteId,
          state: 'PUBLISHED',
          publishedAt: iso(project.publishedAt),
          historical: true,
        },
      });
    }
    if (project.scheduledAt && !project.youtubeVideoId) {
      push({
        sourceTable: 'Project.scheduledAt',
        sourceId: project.id,
        targetTable: 'Publication',
        targetId: stableId('pb', project.id, 'scheduled'),
        data: {
          projectId: vp,
          deliverableId: deliverables.final,
          socialAccountId: accountId,
          platform: 'YOUTUBE',
          // §7/§18.11: nunca dispara durante a transição.
          state: 'DRAFT',
          requestedScheduleAt: iso(project.scheduledAt),
          historical: false,
        },
      });
      pending.push({
        sourceTable: 'Project',
        sourceId: project.id,
        reason: 'SCHEDULE_PAUSED',
        detail: `Agendamento ${iso(project.scheduledAt)} migrado como rascunho pausado; exige revisão e nova aprovação.`,
      });
    }

    if (project.verseId) {
      push({
        sourceTable: 'Project.verseId',
        sourceId: project.id,
        targetTable: 'VerseUsage',
        targetId: stableId('vu', project.id, project.verseId),
        data: { verseId: project.verseId, projectId: vp, channelId: ch, usedAt: iso(project.renderedAt ?? project.createdAt) },
      });
    }
  }

  return { sourceRef: snapshot.sourceRef, entries, pending, counts: reconcile(snapshot, entries, pending) };
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

/** Conciliação origem × plano × pendências por tabela (relatório RF-02). */
function reconcile(snapshot: LegacySnapshot, entries: PlanEntry[], pending: PendingItem[]) {
  const planned = (table: string, target: PlanTarget) =>
    new Set(entries.filter((e) => e.sourceTable === table && e.targetTable === target).map((e) => e.sourceId)).size;
  const pend = (table: string, reasons?: PendingItem['reason'][]) =>
    new Set(pending.filter((p) => p.sourceTable === table && (!reasons || reasons.includes(p.reason))).map((p) => p.sourceId)).size;
  return {
    User: { source: snapshot.users.length, planned: planned('User', 'Workspace'), pending: 0 },
    Project: { source: snapshot.projects.length, planned: planned('Project', 'VideoProject'), pending: pend('Project', ['NO_OWNER', 'NO_CHANNEL_MAPPING']) },
    Clip: { source: snapshot.clips.length, planned: planned('Clip', 'Asset'), pending: 0 },
    MediaAsset: { source: snapshot.mediaAssets.length, planned: planned('MediaAsset', 'Asset'), pending: pend('MediaAsset') },
    SoundAsset: { source: snapshot.soundAssets.length, planned: planned('SoundAsset', 'Asset'), pending: 0 },
    YouTubeChannel: { source: snapshot.youtubeChannels.length, planned: planned('YouTubeChannel', 'SocialAccount'), pending: pend('YouTubeChannel') },
    Recipe: { source: snapshot.recipes.length, planned: planned('Recipe', 'RecipeChannelLink'), pending: 0 },
    BibleVerse: { source: snapshot.bibleVerseCount, planned: snapshot.bibleVerseCount, pending: 0 },
  };
}
