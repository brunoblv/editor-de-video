/**
 * Central de mídias e agenda sobre PostgreSQL REAL. Só roda com
 * V3_TEST_DATABASE_URL apontando para um banco DESCARTÁVEL já migrado.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { before, describe, it } from 'node:test';

const url = process.env.V3_TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;

// PNG 1×1 válido; o sufixo muda o hash de cada arquivo do teste.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==', 'base64');

describe('central de mídias e agenda', { skip }, () => {
  let db: typeof import('../src/index.js');
  let v3: typeof import('../src/v3/index.js');
  const owner = { userId: `media-owner-${randomUUID()}` };
  const stranger = { userId: `media-other-${randomUUID()}` };
  const editor = { userId: `media-editor-${randomUUID()}` };
  let mago: string;
  let midnight: string;
  const future = () => new Date(Date.now() + 86400_000);

  const upload = (actor: { userId: string }, channelId: string, name: string, extra = randomUUID()) =>
    v3.uploadChannelMedia(actor, channelId, { originalName: name, stream: Readable.from([Buffer.concat([PNG, Buffer.from(extra)])]), tmpDir: path.join(os.tmpdir(), 'v3-media-test') });

  before(async () => {
    process.env.STORAGE_LOCAL_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'v3-media-storage-'));
    db = await import('../src/index.js');
    v3 = await import('../src/v3/index.js');
    for (const { userId } of [owner, stranger, editor]) {
      await db.prisma.user.create({ data: { id: userId, email: `${userId}@test.local`, passwordHash: 'x' } });
    }
    const workspaceId = await v3.ensureWorkspaceForUser(owner.userId, 'Dono');
    await db.prisma.membership.create({ data: { workspaceId, userId: editor.userId, role: 'EDITOR' } });
    await v3.ensureWorkspaceForUser(stranger.userId, 'Outro');
    const channels = await v3.listChannels(owner, workspaceId);
    mago = channels.find((c) => c.slug === 'mago-da-meia-noite')!.id;
    midnight = channels.find((c) => c.slug === 'midnight-relaxing-sounds')!.id;
  });

  it('workspace antigo ganha o canal novo sem duplicar nem alterar edições', async () => {
    const workspaceId = (await db.prisma.channel.findUniqueOrThrow({ where: { id: mago } })).workspaceId;
    await db.prisma.channel.update({ where: { id: mago }, data: { tagline: 'editado' } });
    await v3.ensureWorkspaceForUser(owner.userId, 'Dono');
    await v3.upsertChannelSeed(workspaceId, (await import('@editor-video/domain')).buildAdditionalChannelSeeds()[0]!);
    const found = await db.prisma.channel.findMany({ where: { workspaceId, slug: 'mago-da-meia-noite' } });
    assert.equal(found.length, 1);
    assert.equal(found[0]!.tagline, 'editado');
  });

  it('mídia pertence ao canal; o mesmo arquivo reaproveita o original', async () => {
    const shared = randomUUID();
    const a = await upload(owner, mago, 'arte.png', shared);
    const b = await upload(owner, midnight, 'arte-copia.png', shared);
    assert.equal(a.id, b.id);
    assert.ok((await v3.listChannelMedia(owner, mago)).some((x) => x.id === a.id));
    await v3.removeChannelMedia(owner, midnight, a.id);
    assert.ok(!(await v3.listChannelMedia(owner, midnight)).some((x) => x.id === a.id));
    assert.ok((await v3.listChannelMedia(owner, mago)).some((x) => x.id === a.id));
    await assert.rejects(() => upload(owner, mago, 'fonte.ttf'), /aceita imagem/);
  });

  it('isola canal de outro workspace e post de mídia de outro canal', async () => {
    const asset = await upload(owner, mago, 'isolada.png');
    await assert.rejects(() => v3.listChannelMedia(stranger, mago), /não encontrado/);
    await assert.rejects(() => upload(stranger, mago, 'invasao.png'), /não encontrado/);
    await assert.rejects(() => v3.createSocialPost(stranger, mago, {}), /não encontrado/);
    await assert.rejects(() => v3.createSocialPost(owner, midnight, { assetIds: [asset.id] }), /não pertence/);
    const post = await v3.createSocialPost(owner, mago, { caption: 'x' });
    await assert.rejects(() => v3.updateSocialPost(stranger, post.id, {}), /não encontrado/);
  });

  it('agendar valida o post e exige o papel de dono', async () => {
    const asset = await upload(owner, mago, 'capa.png');
    const post = await v3.createSocialPost(editor, mago, { caption: 'Primeiro', platforms: ['INSTAGRAM'] });
    await assert.rejects(() => v3.scheduleSocialPost(owner, post.id, future()), /precisa de mídia/);
    await v3.updateSocialPost(editor, post.id, { caption: 'Primeiro', platforms: ['INSTAGRAM'], assetIds: [asset.id] });
    await assert.rejects(() => v3.scheduleSocialPost(editor, post.id, future()), /papel/);
    await assert.rejects(() => v3.scheduleSocialPost(owner, post.id, new Date(Date.now() - 3600_000)), /passado/);
    const scheduled = await v3.scheduleSocialPost(owner, post.id, future());
    assert.equal(scheduled.state, 'SCHEDULED');
    await assert.rejects(() => v3.updateSocialPost(editor, post.id, { caption: 'x', platforms: ['INSTAGRAM'] }), /precisa de mídia/);
    await assert.rejects(() => v3.removeChannelMedia(owner, mago, asset.id), /post\(s\) em aberto/);
    const back = await v3.unscheduleSocialPost(owner, post.id);
    assert.equal(back.state, 'DRAFT');
    assert.equal(back.scheduledAt, null);
  });

  it('marcar cada rede conclui o post; desmarcar reabre; postado trava alterações', async () => {
    const post = await v3.createSocialPost(owner, mago, { caption: 'Duas redes', platforms: ['FACEBOOK', 'INSTAGRAM'], assetIds: [(await upload(owner, mago, 'duas.png')).id] });
    const when = future();
    await v3.scheduleSocialPost(owner, post.id, when);
    await assert.rejects(() => v3.setSocialPostTargetPosted(owner, post.id, { platform: 'TIKTOK', posted: true }), /não faz parte/);
    const one = await v3.setSocialPostTargetPosted(owner, post.id, { platform: 'INSTAGRAM', posted: true, remoteUrl: 'https://instagram.com/p/1' });
    assert.equal(one.state, 'SCHEDULED');
    await assert.rejects(() => v3.updateSocialPost(owner, post.id, { caption: 'x' }), /já saiu/);
    await assert.rejects(() => v3.cancelSocialPost(owner, post.id), /já saiu/);
    const both = await v3.setSocialPostTargetPosted(owner, post.id, { platform: 'FACEBOOK', posted: true });
    assert.equal(both.state, 'POSTED');
    assert.ok(both.postedAt);
    const reopened = await v3.setSocialPostTargetPosted(owner, post.id, { platform: 'FACEBOOK', posted: false });
    assert.equal(reopened.state, 'SCHEDULED');
    assert.equal(reopened.postedAt, null);
  });

  it('agenda separa período, rascunhos e posts vencidos, sem cancelados', async () => {
    const media = await upload(owner, mago, 'lista.png');
    const scheduled = await v3.createSocialPost(owner, mago, { caption: 'No período', platforms: ['INSTAGRAM'], assetIds: [media.id] });
    // Longe dos horários usados pelos outros testes.
    const when = new Date(Date.now() + 30 * 86400_000);
    await v3.scheduleSocialPost(owner, scheduled.id, when);
    const overdue = await v3.createSocialPost(owner, mago, { caption: 'Vencido', platforms: ['FACEBOOK'] });
    await v3.scheduleSocialPost(owner, overdue.id, new Date());
    await db.prisma.socialPost.update({ where: { id: overdue.id }, data: { scheduledAt: new Date(Date.now() - 3600_000) } });
    const dropped = await v3.createSocialPost(owner, mago, { caption: 'Descartado' });
    await v3.cancelSocialPost(owner, dropped.id);

    const agenda = await v3.listSocialPosts(owner, mago, { from: new Date(when.getTime() - 1000), to: new Date(when.getTime() + 1000) });
    assert.deepEqual(agenda.posts.map((p) => p.id), [scheduled.id]);
    assert.ok(agenda.due.some((p) => p.id === overdue.id));
    assert.ok(!agenda.due.some((p) => p.id === scheduled.id));
    assert.ok(![...agenda.drafts, ...agenda.posts, ...agenda.due].some((p) => p.id === dropped.id));
    assert.deepEqual((await v3.listSocialPosts(owner, midnight, { from: new Date(0), to: new Date(when.getTime() + 1000) })).posts, []);
  });
});
