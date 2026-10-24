/**
 * Integração com PostgreSQL REAL (AC-01, AC-06, AC-08, AC-12).
 *
 * Só roda com V3_TEST_DATABASE_URL apontando para um banco DESCARTÁVEL já
 * migrado (`DATABASE_URL=$V3_TEST_DATABASE_URL npx prisma migrate deploy`).
 * Nunca aponte para o banco de produção/legado.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, describe, it } from 'node:test';

const url = process.env.V3_TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;

describe('serviços V3 sobre Postgres', { skip }, () => {
  let db: typeof import('../src/index.js');
  let v3: typeof import('../src/v3/index.js');
  const userA = `test-a-${randomUUID()}`;
  const userB = `test-b-${randomUUID()}`;

  before(async () => {
    db = await import('../src/index.js');
    v3 = await import('../src/v3/index.js');
    for (const id of [userA, userB]) {
      await db.prisma.user.create({ data: { id, email: `${id}@test.local`, passwordHash: 'x' } });
    }
  });

  it('cria workspace com os três canais preservados', async () => {
    const ws = await v3.ensureWorkspaceForUser(userA, 'A');
    const again = await v3.ensureWorkspaceForUser(userA, 'A');
    assert.equal(ws, again);
    const channels = await v3.listChannels({ userId: userA });
    assert.deepEqual(channels.map((c) => c.slug).sort(), ['canal-cristao', 'midnight-relaxing-sounds', 'rabisco']);
  });

  it('AC-06/AC-08: patch concorrente é rejeitado; restaurar preserva histórico', async () => {
    const actor = { userId: userA };
    const channels = await v3.listChannels(actor);
    const project = await v3.createProject(actor, { channelId: channels[0]!.id, title: 'Teste', formats: ['16:9', '9:16'] });
    const base = project.currentRevisionId!;
    const textItem = { id: 't1', kind: 'text' as const, text: 'A', timelineStart: 0, duration: 30, locked: false, language: 'pt-BR', style: {} as never, transform: {} as never };
    const { parseItem } = await import('@editor-video/timeline');
    const first = await v3.commitPatch(actor, project.id, { expectedRevisionId: base, operations: [{ op: 'insertClip', trackId: 'T1', item: parseItem(textItem) }], origin: { author: 'human' } });
    await assert.rejects(
      v3.commitPatch(actor, project.id, { expectedRevisionId: base, operations: [{ op: 'removeClip', itemId: 't1' }], origin: { author: 'agent' } }),
      (err: Error & { code?: string }) => err.code === 'CONFLICT',
    );
    // Concorrência real: duas escritas simultâneas a partir da mesma revisão → só uma vence.
    const results = await Promise.allSettled([
      v3.commitPatch(actor, project.id, { expectedRevisionId: first.revisionId, operations: [{ op: 'updateText', itemId: 't1', text: 'humano' }], origin: { author: 'human' } }),
      v3.commitPatch(actor, project.id, { expectedRevisionId: first.revisionId, operations: [{ op: 'updateText', itemId: 't1', text: 'agente' }], origin: { author: 'agent' } }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);

    await v3.restoreProjectRevision(actor, project.id, base, (await db.prisma.videoProject.findUniqueOrThrow({ where: { id: project.id } })).currentRevisionId!);
    const revisions = await v3.listRevisions(actor, project.id);
    assert.equal(revisions.length, 4);
    assert.ok(revisions[0]!.restoredFromRevisionId === base);
  });

  it('AC-01: migração do legado aplicada duas vezes não duplica dados', async () => {
    const legacyUser = `legacy-${randomUUID()}`;
    await db.prisma.user.create({ data: { id: legacyUser, email: `${legacyUser}@test.local`, passwordHash: 'x' } });
    await db.prisma.project.createMany({
      data: [
        { id: `${legacyUser}-amb`, title: 'Chuva', kind: 'AMBIENT', userId: legacyUser, youtubeVideoId: `yt-${legacyUser}`, outputKey: `projects/${legacyUser}-amb/output/final.mp4` },
        { id: `${legacyUser}-cri`, title: 'Fé', kind: 'CHRISTIAN', userId: legacyUser, scheduledAt: new Date(Date.now() + 86400_000) },
        { id: `${legacyUser}-top`, title: 'Top', kind: 'TOP_LIST', userId: legacyUser },
      ],
    });
    await db.prisma.youTubeChannel.create({ data: { userId: legacyUser, channelId: `UC-${legacyUser}`, accessToken: 'segredo-a', refreshToken: 'segredo-r' } });

    const opts = { sourceRef: 'test', dryRun: false, primaryUserId: legacyUser };
    const first = await v3.runMigration(opts);
    const count = async () => ({
      ws: await db.prisma.workspace.count(),
      ch: await db.prisma.channel.count(),
      vp: await db.prisma.videoProject.count(),
      pub: await db.prisma.publication.count(),
      sa: await db.prisma.socialAccount.count(),
      map: await db.prisma.legacyMapping.count(),
    });
    const afterFirst = await count();
    await v3.runMigration(opts);
    assert.deepEqual(await count(), afterFirst);

    const scheduled = await db.prisma.publication.findFirst({ where: { requestedScheduleAt: { not: null }, project: { legacyProjectId: `${legacyUser}-cri` } } });
    assert.equal(scheduled?.state, 'DRAFT', 'agendamento migrado pausado');
    const historical = await db.prisma.publication.findFirst({ where: { remoteId: `yt-${legacyUser}` } });
    assert.equal(historical?.state, 'PUBLISHED');
    const account = await db.prisma.socialAccount.findFirst({ where: { externalId: `UC-${legacyUser}` } });
    assert.equal(account?.channelId, null, 'conta sem canal implícito');
    assert.ok(!JSON.stringify(first.report).includes('segredo'), 'relatório sem tokens');
    const pending = (first.report.pending as Array<{ sourceId: string; reason: string }>).map((p) => `${p.sourceId}:${p.reason}`);
    assert.ok(pending.includes(`${legacyUser}-top:NO_CHANNEL_MAPPING`));
  });

  it('AC-12: usuário não acessa projeto de outro workspace', async () => {
    await v3.ensureWorkspaceForUser(userB, 'B');
    const [projectOfA] = await v3.listProjects({ userId: userA });
    await assert.rejects(v3.getProject({ userId: userB }, projectOfA!.id), (err: Error & { code?: string }) => err.code === 'NOT_FOUND');
    assert.equal((await v3.listProjects({ userId: userB })).length, 0);
  });
});
