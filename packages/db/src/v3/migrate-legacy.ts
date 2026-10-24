/**
 * Executor da migração legado → V3 (§18). Uso:
 *
 *   npm run v3:migrate-legacy -w @editor-video/db -- --dry-run [--primary-user <id>] [--map p1=canal ...] [--account yc1=canal]
 *   npm run v3:migrate-legacy -w @editor-video/db -- --apply --source-ref main@<sha> ...
 *
 * - Pré-requisito: backup restaurável do banco E do storage (§18.2).
 * - Dry-run não escreve nada além do registro MigrationRun com o relatório.
 * - Apply usa os IDs estáveis do plano + LegacyMapping: rodar de novo não
 *   duplica (AC-01). Nada do legado é apagado.
 * - Tokens do YouTube legado são cifrados (CREDENTIALS_ENCRYPTION_KEY) e
 *   nunca aparecem no relatório/logs; sem chave, a conta fica para reconexão.
 */
import { getStorage } from '@editor-video/core/server';
import { buildChannelSeeds, planMigration, type LegacySnapshot, type MigrationOptions, type MigrationPlan, type PlanEntry } from '@editor-video/domain';
import { hashFile } from '@editor-video/integrations';
import type { Prisma } from '@prisma/client';
import { prisma } from '../client.js';
import { upsertChannelSeed } from './channels.js';
import { encryptCredentials } from './crypto.js';

const json = (v: unknown) => v as Prisma.InputJsonValue;

/** Lê o retrato do legado em lotes pequenos de colunas (sem tokens). */
export async function loadLegacySnapshot(sourceRef: string): Promise<LegacySnapshot> {
  const [users, projects, clips, mediaAssets, soundAssets, youtubeChannels, recipes, bibleVerseCount] = await Promise.all([
    prisma.user.findMany({ select: { id: true, email: true, name: true } }),
    prisma.project.findMany({
      select: { id: true, title: true, kind: true, status: true, userId: true, outputKey: true, outputSizeByte: true, previewKey: true, renderedAt: true, scheduledAt: true, youtubeVideoId: true, youtubeShortId: true, publishedAt: true, verseId: true, recipeId: true, parentProjectId: true, createdAt: true },
    }),
    prisma.clip.findMany({ select: { id: true, projectId: true, originalName: true, sourceKey: true, sizeByte: true, sourceDurationSec: true } }),
    prisma.mediaAsset.findMany({ select: { id: true, projectId: true, provider: true, sourceUrl: true, author: true, license: true, localKey: true } }),
    prisma.soundAsset.findMany({ select: { id: true, name: true, category: true, provider: true, sourceUrl: true, localKey: true, license: true, licenseVerdict: true, attribution: true } }),
    prisma.youTubeChannel.findMany({ select: { id: true, userId: true, channelId: true, channelTitle: true, playlistMapJson: true } }),
    prisma.recipe.findMany({ select: { id: true, versions: { select: { version: true } } } }),
    prisma.bibleVerse.count(),
  ]);
  return {
    sourceRef,
    users,
    projects,
    clips,
    mediaAssets,
    soundAssets,
    youtubeChannels: youtubeChannels.map((y) => ({ id: y.id, userId: y.userId, channelId: y.channelId, channelTitle: y.channelTitle, hasPlaylistMap: y.playlistMapJson != null })),
    recipes: recipes.map((r) => ({ id: r.id, versions: r.versions.map((v) => v.version) })),
    bibleVerseCount,
  };
}

/** Verifica no storage os arquivos que o plano referencia (relatório de faltantes). */
export async function findMissingFiles(plan: MigrationPlan): Promise<Array<{ sourceTable: string; sourceId: string; key: string }>> {
  const storage = getStorage();
  const missing: Array<{ sourceTable: string; sourceId: string; key: string }> = [];
  for (const entry of plan.entries) {
    const key = entry.data.storageKey;
    if (typeof key !== 'string') continue;
    if (!(await storage.exists(key))) missing.push({ sourceTable: entry.sourceTable, sourceId: entry.sourceId, key });
  }
  return missing;
}

async function mapping(entry: PlanEntry, runId: string, targetId = entry.targetId) {
  await prisma.legacyMapping.upsert({
    where: { sourceTable_sourceId_targetTable: { sourceTable: entry.sourceTable, sourceId: entry.sourceId, targetTable: entry.targetTable } },
    update: { targetId },
    create: { sourceTable: entry.sourceTable, sourceId: entry.sourceId, targetTable: entry.targetTable, targetId, migrationRunId: runId },
  });
}

const ORDER: PlanEntry['targetTable'][] = [
  'Workspace',
  'Membership',
  'Channel',
  'SocialAccount',
  'RecipeChannelLink',
  'Asset',
  'VideoProject',
  'AssetUsage',
  'Deliverable',
  'Publication',
  'VerseUsage',
];

export async function applyPlan(plan: MigrationPlan, runId: string) {
  const storage = getStorage();
  const seeds = new Map(buildChannelSeeds().map((s) => [s.slug, s]));
  const assetIdMap = new Map<string, string>();
  const errors: Array<{ sourceTable: string; sourceId: string; error: string }> = [];
  const missing = new Set((await findMissingFiles(plan)).map((m) => `${m.sourceTable}:${m.sourceId}`));

  for (const table of ORDER) {
    for (const entry of plan.entries.filter((e) => e.targetTable === table)) {
      const d = entry.data as Record<string, any>;
      try {
        switch (table) {
          case 'Workspace':
            await prisma.workspace.upsert({ where: { id: entry.targetId }, update: {}, create: { id: entry.targetId, name: d.name } });
            break;
          case 'Membership':
            await prisma.membership.upsert({
              where: { workspaceId_userId: { workspaceId: d.workspaceId, userId: d.userId } },
              update: {},
              create: { id: entry.targetId, workspaceId: d.workspaceId, userId: d.userId, role: d.role },
            });
            break;
          case 'Channel': {
            const seed = seeds.get(d.slug);
            if (!seed) throw new Error(`Semente ${d.slug} inexistente`);
            const channel = await upsertChannelSeed(d.workspaceId, seed, { channelId: entry.targetId });
            await mapping(entry, runId, channel.id);
            continue;
          }
          case 'SocialAccount': {
            const legacy = await prisma.youTubeChannel.findUnique({ where: { id: entry.sourceId } });
            let encryptedCredentials: string | null = null;
            let status: 'CONNECTED' | 'EXPIRED' = 'EXPIRED';
            if (legacy && process.env.CREDENTIALS_ENCRYPTION_KEY) {
              encryptedCredentials = encryptCredentials({ accessToken: legacy.accessToken, refreshToken: legacy.refreshToken, scope: legacy.scope });
              status = 'CONNECTED';
            }
            await prisma.socialAccount.upsert({
              where: { legacyYouTubeChannelId: entry.sourceId },
              update: {},
              create: {
                id: entry.targetId,
                workspaceId: d.workspaceId,
                channelId: d.channelId,
                platform: 'YOUTUBE',
                externalId: d.externalId,
                displayName: d.displayName,
                status,
                encryptedCredentials,
                scopes: legacy?.scope ? legacy.scope.split(' ') : [],
                tokenExpiresAt: legacy?.expiresAt ?? null,
                legacyYouTubeChannelId: entry.sourceId,
              },
            });
            break;
          }
          case 'RecipeChannelLink':
            await prisma.recipe.updateMany({ where: { id: entry.targetId, channelId: null }, data: { channelId: d.channelId } });
            break;
          case 'Asset': {
            if (missing.has(`${entry.sourceTable}:${entry.sourceId}`)) {
              errors.push({ sourceTable: entry.sourceTable, sourceId: entry.sourceId, error: `Arquivo ausente: ${d.storageKey}` });
              continue;
            }
            const sha256 = await hashFile(await storage.toLocalPath(d.storageKey));
            const existing = await prisma.asset.findUnique({ where: { workspaceId_sha256: { workspaceId: d.workspaceId, sha256 } } });
            const asset =
              existing ??
              (await prisma.asset.upsert({
                where: { id: entry.targetId },
                update: {},
                create: {
                  id: entry.targetId,
                  workspaceId: d.workspaceId,
                  kind: String(d.kind).toUpperCase() as 'VIDEO' | 'AUDIO',
                  status: 'UPLOADED',
                  sha256,
                  storageKey: d.storageKey,
                  originalName: d.originalName ?? d.storageKey.split('/').pop(),
                  sizeBytes: d.sizeBytes ? BigInt(d.sizeBytes) : null,
                  provider: d.provider ?? null,
                  sourceUrl: d.sourceUrl ?? null,
                  author: d.author ?? null,
                  license: d.license ?? null,
                  licenseVerdict: d.licenseVerdict ?? 'UNKNOWN',
                  attribution: d.attribution ?? null,
                  tags: d.tags ?? ['legado'],
                },
              }));
            assetIdMap.set(entry.targetId, asset.id);
            await mapping(entry, runId, asset.id);
            continue;
          }
          case 'VideoProject': {
            const legacy = await prisma.project.findUnique({ where: { id: entry.sourceId } });
            const snapshot = legacy ? JSON.parse(JSON.stringify(legacy, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) : null;
            await prisma.videoProject.upsert({
              where: { legacyProjectId: entry.sourceId },
              update: {},
              create: {
                id: entry.targetId,
                workspaceId: d.workspaceId,
                channelId: d.channelId,
                title: d.title,
                legacyKind: d.legacyKind,
                legacyProjectId: entry.sourceId,
                legacyReadOnly: true,
                legacySnapshotJson: json(snapshot),
                state: 'ARCHIVED',
                createdAt: d.createdAt ? new Date(d.createdAt) : undefined,
              },
            });
            break;
          }
          case 'AssetUsage': {
            const assetId = assetIdMap.get(d.assetId) ?? (await prisma.asset.findUnique({ where: { id: d.assetId } }))?.id;
            if (!assetId) continue;
            await prisma.assetUsage.upsert({ where: { assetId_projectId: { assetId, projectId: d.projectId } }, update: {}, create: { assetId, projectId: d.projectId } });
            break;
          }
          case 'Deliverable': {
            const exists = await storage.exists(d.storageKey);
            const sha256 = exists ? await hashFile(await storage.toLocalPath(d.storageKey)) : null;
            await prisma.deliverable.upsert({
              where: { id: entry.targetId },
              update: {},
              create: {
                id: entry.targetId,
                projectId: d.projectId,
                kind: d.kind,
                origin: 'LEGACY',
                state: exists ? 'READY' : 'FAILED',
                storageKey: d.storageKey,
                sha256,
                sizeBytes: d.sizeBytes ? BigInt(d.sizeBytes) : null,
                validationJson: exists ? undefined : json({ error: 'Arquivo legado ausente no storage' }),
                createdAt: d.createdAt ? new Date(d.createdAt) : undefined,
              },
            });
            break;
          }
          case 'Publication':
            await prisma.publication.upsert({
              where: { id: entry.targetId },
              update: {},
              create: {
                id: entry.targetId,
                projectId: d.projectId,
                deliverableId: d.deliverableId,
                socialAccountId: d.socialAccountId,
                platform: 'YOUTUBE',
                state: d.state,
                remoteId: d.remoteId ?? null,
                publishedAt: d.publishedAt ? new Date(d.publishedAt) : null,
                requestedScheduleAt: d.requestedScheduleAt ? new Date(d.requestedScheduleAt) : null,
                historical: Boolean(d.historical),
              },
            });
            break;
          case 'VerseUsage':
            await prisma.verseUsage.upsert({
              where: { verseId_projectId: { verseId: d.verseId, projectId: d.projectId } },
              update: {},
              create: { id: entry.targetId, verseId: d.verseId, projectId: d.projectId, channelId: d.channelId, usedAt: d.usedAt ? new Date(d.usedAt) : undefined },
            });
            break;
          default:
            continue;
        }
        await mapping(entry, runId);
      } catch (err) {
        errors.push({ sourceTable: entry.sourceTable, sourceId: entry.sourceId, error: (err as Error).message.slice(0, 500) });
      }
    }
  }
  return { errors };
}

export async function runMigration(options: MigrationOptions & { sourceRef: string; dryRun: boolean }) {
  const snapshot = await loadLegacySnapshot(options.sourceRef);
  const plan = planMigration(snapshot, options);
  const missingFiles = await findMissingFiles(plan);
  const run = await prisma.migrationRun.create({ data: { sourceRef: options.sourceRef, dryRun: options.dryRun, status: 'RUNNING' } });
  const report: Record<string, unknown> = {
    sourceRef: plan.sourceRef,
    counts: plan.counts,
    plannedByTarget: plan.entries.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.targetTable]: (acc[e.targetTable] ?? 0) + 1 }), {}),
    pending: plan.pending,
    missingFiles,
  };
  try {
    if (!options.dryRun) {
      const { errors } = await applyPlan(plan, run.id);
      report.errors = errors;
      report.mappings = await prisma.legacyMapping.count();
    }
    await prisma.migrationRun.update({ where: { id: run.id }, data: { status: 'DONE', reportJson: json(report), finishedAt: new Date() } });
  } catch (err) {
    await prisma.migrationRun.update({ where: { id: run.id }, data: { status: 'FAILED', reportJson: json({ ...report, fatal: (err as Error).message }), finishedAt: new Date() } });
    throw err;
  }
  return { runId: run.id, report };
}

function parseArgs(argv: string[]) {
  const args = { dryRun: true, sourceRef: 'unknown', primaryUserId: undefined as string | undefined, projectChannelOverrides: {} as Record<string, string>, socialAccountChannelOverrides: {} as Record<string, string> };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i] ?? '';
    if (a === '--apply') args.dryRun = false;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--source-ref') args.sourceRef = next();
    else if (a === '--primary-user') args.primaryUserId = next();
    else if (a === '--map') {
      const [k, v] = next().split('=');
      if (k && v) args.projectChannelOverrides[k] = v;
    } else if (a === '--account') {
      const [k, v] = next().split('=');
      if (k && v) args.socialAccountChannelOverrides[k] = v;
    }
  }
  return args;
}

const isMain = process.argv[1] && /migrate-legacy\.(ts|js)$/.test(process.argv[1]);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  runMigration(args)
    .then(({ runId, report }) => {
      console.log(JSON.stringify({ runId, dryRun: args.dryRun, ...report }, null, 2));
      return prisma.$disconnect();
    })
    .catch(async (err) => {
      console.error('[v3:migrate-legacy] falhou:', (err as Error).message);
      await prisma.$disconnect();
      process.exit(1);
    });
}
