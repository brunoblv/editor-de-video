/**
 * Ponta a ponta (AC-03/AC-07/AC-09): criar → mídia real → timeline →
 * composição Hyperframes → render 16:9 e 9:16 → validação → entrega READY.
 * Requer V3_TEST_DATABASE_URL (banco descartável migrado). Sem Redis: o job
 * fica QUEUED no banco e é executado aqui pelos handlers do worker.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const url = process.env.V3_TEST_DATABASE_URL;
const skip = !url;
if (url) {
  process.env.DATABASE_URL = url;
  process.env.STORAGE_LOCAL_DIR = path.join(os.tmpdir(), `ev-e2e-storage-${Date.now()}`);
  process.env.REDIS_URL = 'redis://127.0.0.1:1';
}

describe('pipeline V3 ponta a ponta', { skip }, () => {
  let v3: typeof import('@editor-video/db/v3');
  let db: typeof import('@editor-video/db');
  let handleRender: typeof import('../src/handlers/render.js').handleRender;
  const userId = `e2e-${randomUUID()}`;
  let clip: string;

  before(async () => {
    v3 = await import('@editor-video/db/v3');
    db = await import('@editor-video/db');
    ({ handleRender } = await import('../src/handlers/render.js'));
    const { runProcess, toolPaths } = await import('@editor-video/integrations');
    await db.prisma.user.create({ data: { id: userId, email: `${userId}@test.local`, passwordHash: 'x' } });
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ev-e2e-'));
    clip = path.join(dir, 'entrevista.mp4');
    await runProcess(toolPaths().ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip]);
  });

  after(async () => {
    await v3.closeQueues();
    await db.prisma.$disconnect();
  });

  it('gera entregas válidas em 16:9 e 9:16 a partir de mídia real', async () => {
    const actor = { userId };
    const workspaceId = await v3.ensureWorkspaceForUser(userId, 'E2E');
    const channels = await v3.listChannels(actor);
    const christian = channels.find((c) => c.slug === 'canal-cristao')!;
    let project = await v3.createProject(actor, { channelId: christian.id, title: 'E2E', formats: ['16:9', '9:16'] });

    const asset = await v3.registerAssetFromFile(actor, { workspaceId, localPath: clip, originalName: 'entrevista.mp4' });
    const again = await v3.registerAssetFromFile(actor, { workspaceId, localPath: clip, originalName: 'copia.mp4' });
    assert.equal(again.id, asset.id, 'mesmo hash → mesmo asset');

    const added = await v3.addAssetToProject(actor, project.id, asset.id, project.currentRevisionId!);
    const { parseItem, addVariant } = await import('@editor-video/timeline');
    const committed = await v3.commitPatch(actor, project.id, {
      expectedRevisionId: added.revisionId,
      operations: [
        { op: 'insertClip', trackId: 'T1', item: parseItem({ id: 'verso', kind: 'composition', templateId: 'christian-verse-card', templateVersion: 1, params: { text: 'O Senhor é o meu pastor.', reference: 'Salmos 23:1' }, timelineStart: 30, duration: 60, transform: { opacity: 0.9 } }) },
        { op: 'insertClip', trackId: 'C1', item: parseItem({ id: 'leg1', kind: 'caption', text: 'Legenda de teste', timelineStart: 100, duration: 60 }) },
      ],
      origin: { author: 'human' },
    });
    // Variante 9:16 com crop central já existe pelo formato; garante crop de preenchimento.
    const filled = await v3.commitDocument(actor, project.id, committed.revisionId, (doc) => addVariant(doc, '9:16', 'fill', 'v-9x16'), 'Enquadramento 9:16');

    for (const variantId of [null, 'v-9x16']) {
      const { jobId, deliverableId } = await v3.requestRender(actor, { revisionId: filled.revisionId, variantId, quality: 'final' });
      const job = await v3.claimJob(jobId, 'e2e');
      assert.ok(job, 'job reivindicado (ficou QUEUED no banco sem Redis)');
      const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ev-e2e-job-'));
      await handleRender(job!, { workDir, signal: new AbortController().signal, progress: async () => undefined });
      await v3.finishJob(jobId, 'e2e', { state: 'SUCCEEDED' });
      const deliverable = await db.prisma.deliverable.findUniqueOrThrow({ where: { id: deliverableId } });
      assert.equal(deliverable.state, 'READY');
      assert.equal(deliverable.sha256?.length, 64);
      assert.equal(deliverable.width, variantId ? 1080 : 1920);
      assert.equal(deliverable.height, variantId ? 1920 : 1080);
      assert.equal((deliverable.validationJson as { ok: boolean }).ok, true);
    }

    // AC-09: a composição foi cacheada — o segundo render reaproveitou a etapa.
    const cached = await db.prisma.artifactCache.count({ where: { step: 'composition:verso' } });
    assert.ok(cached >= 1);
    project = await db.prisma.videoProject.findUniqueOrThrow({ where: { id: project.id } });
    assert.equal(project.state, 'EDITING');
  });
});
