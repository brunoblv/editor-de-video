/**
 * Reactive Lyrics sobre PostgreSQL REAL (banco DESCARTÁVEL via V3_TEST_DATABASE_URL):
 * criação, análise, edição de tempo como revisão, conflito 409, papéis,
 * reimportação preservando linhas validadas e regras de render.
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
  process.env.STORAGE_LOCAL_DIR = path.join(os.tmpdir(), `ev-lyrics-storage-${Date.now()}`);
  process.env.REDIS_URL = 'redis://127.0.0.1:1';
}

const LRC = `[ti:Teste]
[00:02.50]<00:02.50>A <00:03.00>luz <00:03.50>chegou
[00:04.50]no meio da noite
[00:06.50]tudo pulsa agora
[00:08.50]e some no fim
[00:11.00]
`;

describe('Reactive Lyrics sobre Postgres', { skip, timeout: 240_000 }, () => {
  let db: typeof import('../src/index.js');
  let v3: typeof import('../src/v3/index.js');
  const owner = `lyr-a-${randomUUID()}`;
  const reviewer = `lyr-r-${randomUUID()}`;
  let wav: string;

  before(async () => {
    db = await import('../src/index.js');
    v3 = await import('../src/v3/index.js');
    for (const id of [owner, reviewer]) await db.prisma.user.create({ data: { id, email: `${id}@test.local`, passwordHash: 'x' } });
    const { runProcess, toolPaths } = await import('@editor-video/integrations');
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ev-lyrics-db-'));
    wav = path.join(dir, 'faixa.wav');
    // 12 s: bumbo a 120 BPM + chimbal no contratempo.
    const expr = '0.7*sin(2*PI*55*t)*exp(-18*mod(t,0.5))+0.4*sin(2*PI*7000*t)*sin(2*PI*9100*t)*exp(-60*mod(t+0.25,0.5))';
    await runProcess(toolPaths().ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc=exprs='${expr}':s=44100:d=12`, '-ac', '2', wav]);
  });

  after(async () => {
    await v3.closeQueues();
    await db.prisma.$disconnect();
  });

  it('cria, analisa, edita, protege e libera o render', async () => {
    const actor = { userId: owner };
    const workspaceId = await v3.ensureWorkspaceForUser(owner, 'Lyrics');
    const channel = (await v3.listChannels(actor))[0]!;
    const audio = await v3.registerAssetFromFile(actor, { workspaceId, localPath: wav, originalName: 'faixa.wav' });

    // Upload malicioso não atravessa o storage nem vira asset.
    await assert.rejects(v3.registerAssetFromFile(actor, { workspaceId, localPath: wav, originalName: '../../etc/passwd' }), (e: Error & { code?: string }) => e.code === 'INVALID');

    const created = await v3.createLyricsProject(actor, {
      channelId: channel.id,
      title: 'Lyrics teste',
      formats: ['9:16', '16:9'],
      audioAssetId: audio.id,
      lyrics: { content: LRC, fileName: 'letra.lrc' },
      language: 'pt-BR',
      presetId: 'GLITCH_ROCK',
      segmentStartMs: 2000,
      segmentDurationMs: 8000,
      rights: { declared: false },
    });
    const projectId = created.project.id;
    const lyricsAsset = await db.prisma.asset.findUniqueOrThrow({ where: { id: created.lyrics.lyricsAssetId! } });
    assert.equal(lyricsAsset.kind, 'DOCUMENT');
    assert.equal(created.lyrics.lyricsFormat, 'lrc');
    const job = await db.prisma.renderJob.findUniqueOrThrow({ where: { id: created.analysisJobId } });
    assert.equal(job.kind, 'ANALYZE');
    assert.deepEqual(job.paramsJson, { music: true });

    const { lyricLines, parseItem } = await import('@editor-video/timeline');
    let project = await v3.getProject(actor, projectId);
    assert.ok(project.lyrics);
    const doc = project.timeline!;
    assert.equal(doc.output.loudnessProfile, 'none');
    assert.equal(doc.video.durationFrames, 240);
    assert.deepEqual(lyricLines(doc).map((l) => [l.text, l.timelineStart]), [['A luz chegou', 15], ['no meio da noite', 75], ['tudo pulsa agora', 135], ['e some no fim', 195]]);
    assert.deepEqual(doc.variants.map((v) => v.id), ['v-16x9']);

    // Sem mapa musical: nem prévia.
    await assert.rejects(v3.requestRender(actor, { revisionId: doc.revisionId, quality: 'preview' }), (e: Error & { code?: string }) => e.code === 'DEPENDENCY_MISSING');

    // Análise (o que o worker faz no job ANALYZE).
    const { analyzeMusic } = await import('@editor-video/integrations');
    const { musicalMapSchema } = await import('@editor-video/domain');
    const map = musicalMapSchema.parse(await analyzeMusic(wav, { audioHash: audio.sha256!, audioAssetId: audio.id, workDir: path.join(os.tmpdir(), `ev-lyr-${Date.now()}`) }));
    const key = await v3.writeMusicalMap(map);
    await v3.attachMusicalMap(audio.id, key, map);
    const state = await v3.getLyricsState(actor, projectId);
    assert.equal(state.analysis.ready, true);
    assert.ok(Math.abs((state.analysis.bpm ?? 0) - 120) < 3, `BPM ${state.analysis.bpm}`);
    assert.deepEqual(state.segment, { itemId: 'song', timelineStart: 0, frames: 240, startMs: 2000, durationMs: 8000 });
    const ui = await v3.getLyricsMap(actor, projectId);
    assert.equal(ui.rms.length, 400);
    assert.ok(ui.beats.every((b) => b >= 0 && b < 8000) && ui.beats.length >= 14);

    // Final sem direitos: proibido. Prévia de trecho: ok, com o trecho no job e na entrega.
    await assert.rejects(v3.requestRender(actor, { revisionId: doc.revisionId, quality: 'final' }), (e: Error & { code?: string }) => e.code === 'FORBIDDEN');
    const preview = await v3.requestRender(actor, { revisionId: doc.revisionId, quality: 'preview', range: { startFrame: 30, endFrame: 120 } });
    const pjob = await db.prisma.renderJob.findUniqueOrThrow({ where: { id: preview.jobId } });
    assert.deepEqual(pjob.paramsJson, { range: { startFrame: 30, endFrame: 120 } });
    assert.equal(pjob.queue, 'v3-preview');

    // Editar o tempo de uma palavra = nova revisão persistida; o áudio não muda.
    const first = lyricLines(doc)[0]!;
    const words = first.words.map((w) => ({ ...w }));
    words[1]!.start += 2;
    const edited = await v3.commitPatch(actor, projectId, { expectedRevisionId: doc.revisionId, operations: [{ op: 'setLyricLine', itemId: first.id, words }], origin: { author: 'human' }, summary: 'Ajuste de palavra' });
    const reopened = await v3.getProject(actor, projectId);
    assert.equal(reopened.currentRevisionId, edited.revisionId);
    assert.equal(lyricLines(reopened.timeline!)[0]!.words[1]!.start, words[1]!.start);
    assert.deepEqual(reopened.timeline!.tracks.find((t) => t.id === 'A1'), doc.tracks.find((t) => t.id === 'A1'));

    // Revisão obsoleta → 409 sem sobrescrever.
    await assert.rejects(
      v3.commitPatch(actor, projectId, { expectedRevisionId: doc.revisionId, operations: [{ op: 'setLyricLine', itemId: first.id, text: 'sobrescrever' }], origin: { author: 'human' } }),
      (e: Error & { code?: string; status?: number }) => e.code === 'CONFLICT' && e.status === 409,
    );

    // Revisor vê, mas não edita.
    await db.prisma.membership.create({ data: { workspaceId, userId: reviewer, role: 'REVIEWER' } });
    assert.ok((await v3.getLyricsState({ userId: reviewer }, projectId)).issues.length > 0);
    await assert.rejects(
      v3.commitPatch({ userId: reviewer }, projectId, { expectedRevisionId: edited.revisionId, operations: [{ op: 'shiftLyrics', trackId: 'L1', frames: 3 }], origin: { author: 'human' } }),
      (e: Error & { code?: string }) => e.code === 'FORBIDDEN',
    );

    // Parâmetros visuais só entram validados.
    await assert.rejects(
      v3.commitPatch(actor, projectId, { expectedRevisionId: edited.revisionId, operations: [{ op: 'updateCompositionParams', itemId: 'lyrics-fx', params: { preset: 'strobe' } }], origin: { author: 'human' } }),
      (e: Error & { code?: string }) => e.code === 'INVALID',
    );
    await assert.rejects(
      v3.commitPatch(actor, projectId, { expectedRevisionId: edited.revisionId, operations: [{ op: 'updateCompositionParams', itemId: 'lyrics-fx', params: { sections: '0-1000:refrao' } }], origin: { author: 'human' } }),
      (e: Error & { code?: string }) => e.code === 'INVALID',
    );
    const visual = await v3.commitPatch(actor, projectId, { expectedRevisionId: edited.revisionId, operations: [{ op: 'updateCompositionParams', itemId: 'lyrics-fx', params: { intensity: 40, sections: '2000-6000:verse;6000-10000:chorus' } }], origin: { author: 'human' } });

    // Validar a primeira linha e reimportar: a validada fica, as outras são trocadas.
    const validated = await v3.commitPatch(actor, projectId, { expectedRevisionId: visual.revisionId, operations: [{ op: 'validateLyrics', itemIds: [first.id], validated: true }], origin: { author: 'human' } });
    const re = await v3.reimportLyrics(actor, projectId, { content: '[00:02.60]linha nova que cruza\n[00:05.00]segunda nova\n[00:07.00]terceira nova\n', fileName: 'nova.lrc', expectedRevisionId: validated.revisionId });
    assert.equal(re.skipped.length, 1, 'a linha que cruza a validada é pulada');
    project = await v3.getProject(actor, projectId);
    const after = lyricLines(project.timeline!);
    assert.equal(after[0]!.text, 'A luz chegou');
    assert.equal(after[0]!.lyric!.status, 'VALIDATED');
    assert.deepEqual(after.slice(1).map((l) => l.text), ['segunda nova', 'terceira nova']);

    // Agente não altera linha validada.
    await assert.rejects(
      v3.commitPatch(actor, projectId, { expectedRevisionId: re.revisionId, operations: [{ op: 'setLyricLine', itemId: first.id, text: 'agente' }], origin: { author: 'agent', agentRunId: 'run' } }),
      (e: Error & { code?: string }) => e.code === 'LOCKED',
    );

    // Linha sem tempo bloqueia o final mesmo com direitos; corrigida, o final é aceito.
    await v3.declareLyricsRights(actor, projectId, { declared: true, note: 'faixa sintética do teste' });
    const second = after[1]!;
    const unaligned = await v3.commitPatch(actor, projectId, { expectedRevisionId: re.revisionId, operations: [{ op: 'setLyricLine', itemId: second.id, status: 'UNALIGNED' }], origin: { author: 'human' } });
    await assert.rejects(v3.requestRender(actor, { revisionId: unaligned.revisionId, quality: 'final' }), (e: Error & { code?: string }) => e.code === 'INVALID');
    const fixed = await v3.commitPatch(actor, projectId, { expectedRevisionId: unaligned.revisionId, operations: [{ op: 'setLyricLine', itemId: second.id, timelineStart: second.timelineStart }], origin: { author: 'human' } });
    const final = await v3.requestRender(actor, { revisionId: fixed.revisionId, quality: 'final', variantId: 'v-16x9' });
    assert.equal(final.queue, 'v3-render-short');

    // Linha manual nova entra pela operação comum de inserção.
    await v3.commitPatch(actor, projectId, {
      expectedRevisionId: fixed.revisionId,
      operations: [{ op: 'insertClip', trackId: 'L1', item: parseItem({ id: 'manual-1', kind: 'caption', text: 'final', timelineStart: 220, duration: 15, lyric: { status: 'SUGGESTED', source: 'manual' } }) }],
      origin: { author: 'human' },
    });
    const revisions = await v3.listRevisions(actor, projectId);
    assert.ok(revisions.length >= 9);
  });
});
