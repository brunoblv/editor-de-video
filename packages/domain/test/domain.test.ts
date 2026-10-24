import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  approvalFingerprint,
  assertTransition,
  buildChannelSeeds,
  can,
  checkEditorialRules,
  decideNextPublishStep,
  isApprovalValid,
  planMigration,
  publicationKey,
  PUBLICATION_TRANSITIONS,
  publicationMetadataSchema,
  REUSABLE_FORMATS,
  stateAfterReconcile,
  stepCacheKey,
  type LegacySnapshot,
} from '../src/index.js';
import { MIDNIGHT_RECIPES } from '@editor-video/core/midnight';
import { PILLARS } from '@editor-video/core/christian';

describe('aprovação vinculada (AC-10)', () => {
  const subject = {
    deliverableId: 'd1',
    deliverableHash: 'h'.repeat(64),
    socialAccountId: 'acc1',
    metadata: publicationMetadataSchema.parse({ title: 'Vídeo', privacy: 'private' }),
  };
  const approval = { fingerprint: approvalFingerprint(subject), decision: 'APPROVED' as const };

  it('vale para a mesma entrega e metadados', () => {
    assert.ok(isApprovalValid(approval, subject));
  });

  it('nova entrega, destino, capa, privacidade ou texto invalidam', () => {
    assert.ok(!isApprovalValid(approval, { ...subject, deliverableHash: 'x'.repeat(64) }));
    assert.ok(!isApprovalValid(approval, { ...subject, socialAccountId: 'acc2' }));
    assert.ok(!isApprovalValid(approval, { ...subject, metadata: { ...subject.metadata, privacy: 'public' } }));
    assert.ok(!isApprovalValid(approval, { ...subject, metadata: { ...subject.metadata, coverHash: 'c1' } }));
    assert.ok(!isApprovalValid(approval, { ...subject, metadata: { ...subject.metadata, title: 'Outro' } }));
  });

  it('ordem das chaves não altera a impressão digital', () => {
    const reordered = { metadata: subject.metadata, socialAccountId: 'acc1', deliverableHash: subject.deliverableHash, deliverableId: 'd1' };
    assert.equal(approvalFingerprint(reordered), approval.fingerprint);
  });
});

describe('publicação sem duplicação (AC-11)', () => {
  it('chave estável por entrega+conta+intenção', () => {
    const a = publicationKey({ deliverableId: 'd', socialAccountId: 's', intent: 'main' });
    assert.equal(a, publicationKey({ intent: 'main', socialAccountId: 's', deliverableId: 'd' }));
    assert.notEqual(a, publicationKey({ deliverableId: 'd', socialAccountId: 's', intent: 'short' }));
  });

  it('timeout exige reconciliação, nunca novo upload cego', () => {
    assert.equal(decideNextPublishStep('UNKNOWN', { outcome: 'TIMEOUT' }).action, 'RECONCILE');
    assert.equal(decideNextPublishStep('FAILED', { outcome: 'TIMEOUT' }).action, 'RECONCILE');
    assert.equal(decideNextPublishStep('FAILED', { outcome: 'FAILED_TRANSIENT', remoteId: 'yt1' }).action, 'RECONCILE');
    assert.equal(
      decideNextPublishStep('FAILED', { outcome: 'FAILED_TRANSIENT', resumableSessionUrl: 'https://x' }).action,
      'RESUME_UPLOAD',
    );
    assert.equal(decideNextPublishStep('PUBLISHED', null).action, 'NONE');
  });

  it('UNKNOWN só sai por reconciliação', () => {
    assert.throws(() => assertTransition('Publication', PUBLICATION_TRANSITIONS, 'UNKNOWN', 'UPLOADING'));
    assert.equal(stateAfterReconcile({ status: 'published' }), 'PUBLISHED');
    assert.equal(stateAfterReconcile(null), 'UNKNOWN');
    assert.equal(stateAfterReconcile({ status: 'not_found' }), 'FAILED');
  });
});

describe('cache (AC-09)', () => {
  it('transcrição depende de hash/modelo/parâmetros, não do título', () => {
    const base = { step: 'transcribe' as const, assetHash: 'abc', params: { language: 'pt' }, model: 'base' };
    assert.equal(stepCacheKey(base), stepCacheKey({ ...base }));
    assert.notEqual(stepCacheKey(base), stepCacheKey({ ...base, model: 'large-v3' }));
    assert.notEqual(stepCacheKey(base), stepCacheKey({ ...base, assetHash: 'def' }));
  });
});

describe('canais preservados (AC-02/AC-14)', () => {
  const seeds = buildChannelSeeds();

  it('três canais próprios e dois formatos reutilizáveis', () => {
    assert.deepEqual(seeds.map((s) => s.slug), ['midnight-relaxing-sounds', 'canal-cristao', 'rabisco']);
    assert.deepEqual(REUSABLE_FORMATS.map((f) => f.legacyKind), ['TOP_LIST', 'CURIOSIDADE']);
  });

  it('Midnight preserva as dez receitas', () => {
    const midnight = seeds[0]!;
    assert.deepEqual(midnight.domain.recipeIds, [
      'RAINY_CABIN',
      'FOREST_THUNDERSTORM',
      'MIDNIGHT_OCEAN',
      'COZY_FIREPLACE',
      'MIDNIGHT_FOREST',
      'RAINY_COFFEE_SHOP',
      'WINTER_CABIN',
      'MIDNIGHT_TRAIN',
      'RAIN_ON_WINDOW',
      'NIGHT_MOUNTAIN',
    ]);
    assert.equal(MIDNIGHT_RECIPES.length, 10);
  });

  it('Cristão preserva 42 pilares, escritura só da biblioteca e regras de saúde', () => {
    const christian = seeds[1]!;
    assert.equal((christian.domain.pillars as unknown[]).length, 42);
    assert.equal(PILLARS.length, 42);
    assert.equal(christian.nameConfirmed, false);
    assert.ok(christian.rules.scriptureFromLibraryOnly);
    assert.equal(checkEditorialRules(christian.rules, 'Ore e você será curado').passed, false);
    assert.equal(checkEditorialRules(christian.rules, 'Deus caminha com você no tratamento').passed, true);
  });

  it('Rabisco não é vinculado a outra marca automaticamente', () => {
    assert.equal(seeds[2]!.linkedBrand, null);
    assert.equal((seeds[2]!.domain.character as { assetsVerified: boolean }).assetsVerified, false);
  });
});

describe('papéis', () => {
  it('revisor aprova mas não edita; editor não gerencia contas', () => {
    assert.ok(can('REVIEWER', 'deliverable.approve'));
    assert.ok(!can('REVIEWER', 'project.edit'));
    assert.ok(!can('EDITOR', 'account.manage'));
  });
});

describe('planejamento da migração (AC-01/RF-02)', () => {
  const snapshot: LegacySnapshot = {
    sourceRef: 'main@bff5ad9',
    users: [
      { id: 'u1', email: 'a@x.com', name: 'A' },
      { id: 'u2', email: 'b@x.com', name: null },
    ],
    projects: [
      { id: 'p1', title: 'Rain', kind: 'AMBIENT', status: 'PUBLISHED', userId: 'u1', outputKey: 'projects/p1/output/final.mp4', outputSizeByte: 10, previewKey: null, renderedAt: '2026-01-01', scheduledAt: null, youtubeVideoId: 'yt1', youtubeShortId: null, publishedAt: '2026-01-02', verseId: null, recipeId: 'RAINY_CABIN', parentProjectId: null, createdAt: '2026-01-01' },
      { id: 'p2', title: 'Fé', kind: 'CHRISTIAN', status: 'READY', userId: 'u1', outputKey: 'k', outputSizeByte: 5, previewKey: null, renderedAt: '2026-02-01', scheduledAt: '2026-11-01T12:00:00Z', youtubeVideoId: null, youtubeShortId: null, publishedAt: null, verseId: 'v1', recipeId: null, parentProjectId: null, createdAt: '2026-02-01' },
      { id: 'p3', title: 'Top 5', kind: 'TOP_LIST', status: 'READY', userId: 'u2', outputKey: null, outputSizeByte: null, previewKey: null, renderedAt: null, scheduledAt: null, youtubeVideoId: null, youtubeShortId: null, publishedAt: null, verseId: null, recipeId: null, parentProjectId: null, createdAt: '2026-03-01' },
      { id: 'p4', title: 'Órfão', kind: 'RABISCO', status: 'DRAFT', userId: null, outputKey: null, outputSizeByte: null, previewKey: null, renderedAt: null, scheduledAt: null, youtubeVideoId: null, youtubeShortId: null, publishedAt: null, verseId: null, recipeId: null, parentProjectId: null, createdAt: '2026-03-01' },
    ],
    clips: [{ id: 'cl1', projectId: 'p3', originalName: 'a.mp4', sourceKey: 'projects/p3/source/cl1.mp4', sizeByte: 3_000_000_000, sourceDurationSec: 10 }],
    mediaAssets: [],
    soundAssets: [{ id: 's1', name: 'Rain', category: 'rain', provider: 'freesound', sourceUrl: null, localKey: 'library/sounds/s1.wav', license: 'CC0', licenseVerdict: 'SAFE', attribution: null }],
    youtubeChannels: [{ id: 'yc1', userId: 'u1', channelId: 'UC123', channelTitle: 'Midnight', hasPlaylistMap: true }],
    recipes: [{ id: 'RAINY_CABIN', versions: [1, 2] }],
    bibleVerseCount: 31102,
  };

  it('é determinístico (executar duas vezes gera o mesmo plano)', () => {
    assert.deepEqual(planMigration(snapshot), planMigration(snapshot));
  });

  it('isola usuários, pausa agendamentos e deixa pendências explícitas', () => {
    const plan = planMigration(snapshot);
    const workspaces = plan.entries.filter((e) => e.targetTable === 'Workspace');
    assert.equal(workspaces.length, 2);

    const reasons = plan.pending.map((p) => `${p.sourceId}:${p.reason}`);
    assert.ok(reasons.includes('p3:NO_CHANNEL_MAPPING'));
    assert.ok(reasons.includes('p4:NO_OWNER'));
    assert.ok(reasons.includes('p2:SCHEDULE_PAUSED'));
    assert.ok(reasons.includes('yc1:SOCIAL_ACCOUNT_UNLINKED'));

    const scheduled = plan.entries.find((e) => e.targetTable === 'Publication' && e.sourceTable === 'Project.scheduledAt');
    assert.equal(scheduled?.data.state, 'DRAFT');
    const published = plan.entries.find((e) => e.sourceTable === 'Project.youtubeVideoId');
    assert.equal(published?.data.remoteId, 'yt1');
    assert.equal(published?.data.state, 'PUBLISHED');

    const verse = plan.entries.filter((e) => e.targetTable === 'VerseUsage');
    assert.equal(verse.length, 1);
    assert.equal(plan.counts.Project!.source, 4);
    assert.equal(plan.counts.Project!.planned + plan.counts.Project!.pending, 4);
  });

  it('mapeamento explícito resolve TOP_LIST; tamanho grande vira string (BigInt)', () => {
    const plan = planMigration(snapshot, { projectChannelOverrides: { p3: 'rabisco' } });
    assert.ok(!plan.pending.some((p) => p.sourceId === 'p3' && p.reason === 'NO_CHANNEL_MAPPING'));
    const clip = plan.entries.find((e) => e.sourceTable === 'Clip' && e.targetTable === 'Asset');
    assert.equal(clip?.data.sizeBytes, '3000000000');
  });
});
