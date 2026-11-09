/**
 * Reactive Lyrics com áudio do YouTube e letra transcrita (Whisper local):
 * busca → declaração de direitos → download → projeto com letra automática →
 * jobs ANALYZE e TRANSCRIBE pelos handlers → linhas `asr` para revisão.
 *
 * Requer V3_TEST_DATABASE_URL (banco DESCARTÁVEL), LYRICS_NETWORK_TEST=1
 * (YouTube + yt-dlp) e faster-whisper no venv padrão (ou LYRICS_PYTHON_BIN).
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const url = process.env.V3_TEST_DATABASE_URL;
const skip = !url || process.env.LYRICS_NETWORK_TEST !== '1';
if (url) {
  process.env.DATABASE_URL = url;
  process.env.STORAGE_LOCAL_DIR = path.join(os.tmpdir(), `ev-lyrics-yt-storage-${Date.now()}`);
  process.env.REDIS_URL = 'redis://127.0.0.1:1';
  process.env.LYRICS_WHISPER_MODEL ??= 'base';
}

describe('Reactive Lyrics: YouTube + Whisper', { skip, timeout: 20 * 60_000 }, () => {
  let v3: typeof import('@editor-video/db/v3');
  let db: typeof import('@editor-video/db');
  let handleAnalyze: typeof import('../src/handlers/analyze.js').handleAnalyze;
  const userId = `lyr-yt-${randomUUID()}`;

  before(async () => {
    v3 = await import('@editor-video/db/v3');
    db = await import('@editor-video/db');
    ({ handleAnalyze } = await import('../src/handlers/analyze.js'));
    await db.prisma.user.create({ data: { id: userId, email: `${userId}@test.local`, passwordHash: 'x' } });
  });

  after(async () => {
    await v3.closeQueues();
    await db.prisma.$disconnect();
  });

  const run = async (jobId: string) => {
    const job = await v3.claimJob(jobId, 'e2e');
    assert.ok(job);
    const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ev-lyr-yt-job-'));
    await handleAnalyze(job!, { workDir, signal: new AbortController().signal, progress: async () => undefined });
    await v3.finishJob(jobId, 'e2e', { state: 'SUCCEEDED' });
  };

  it('baixa com declaração, transcreve e importa a letra como sugestão', async () => {
    const workspaceId = await v3.ensureWorkspaceForUser(userId, 'YT');
    const actor = { userId, workspaceId };
    const channel = (await v3.listChannels(actor))[0]!;

    await assert.rejects(v3.importYoutubeLyricsAudio(actor, { videoId: 'jNQXAC9IVRw', rights: { declared: false } }), (e: Error & { code?: string }) => e.code === 'FORBIDDEN');
    await assert.rejects(v3.importYoutubeLyricsAudio(actor, { videoId: '--exec=calc', rights: { declared: true } }), (e: Error & { code?: string }) => e.code === 'INVALID');
    const { asset, info } = await v3.importYoutubeLyricsAudio(actor, { videoId: 'jNQXAC9IVRw', rights: { declared: true, note: 'teste automatizado' } });
    assert.equal(asset.provider, 'youtube');
    assert.equal(asset.sourceUrl, 'https://www.youtube.com/watch?v=jNQXAC9IVRw');
    assert.equal(asset.author, 'jawed');
    assert.equal(info.title, 'Me at the zoo');

    await assert.rejects(
      v3.createLyricsProject(actor, { channelId: channel.id, title: 'x', formats: ['9:16'], audioAssetId: asset.id, presetId: 'NEON_CINEMATIC', segmentStartMs: 0, segmentDurationMs: 18_000, rights: { declared: true } }),
      (e: Error & { code?: string }) => e.code === 'INVALID',
      'sem letra e sem transcrição',
    );
    const created = await v3.createLyricsProject(actor, {
      channelId: channel.id,
      title: info.title,
      formats: ['9:16'],
      audioAssetId: asset.id,
      autoLyrics: true,
      language: 'en',
      presetId: 'NEON_CINEMATIC',
      segmentStartMs: 0,
      segmentDurationMs: 18_000,
      rights: { declared: true, note: 'teste automatizado' },
    });
    assert.ok(created.transcriptionJobId);
    assert.equal(created.lyrics.lyricsFormat, 'asr');
    const { lyricLines } = await import('@editor-video/timeline');
    assert.equal(lyricLines((await v3.getProject(actor, created.project.id)).timeline!).length, 0);

    await run(created.analysisJobId);
    await run(created.transcriptionJobId!);
    const state = await v3.getLyricsState(actor, created.project.id);
    assert.ok(state.analysis.ready);
    assert.ok(state.transcription.available);

    const doc = (await v3.getProject(actor, created.project.id)).timeline!;
    const lines = lyricLines(doc);
    const text = lines.map((l) => l.text).join(' ').toLowerCase();
    console.log(`letra transcrita: ${lines.map((l) => `[${l.lyric!.status}] ${l.text}`).join(' | ')}`);
    assert.ok(lines.length >= 2, 'várias linhas');
    assert.match(text, /elephant/);
    assert.ok(lines.every((l) => l.lyric!.source === 'asr' && l.lyric!.status !== 'VALIDATED' && l.words.length > 0));
    assert.ok(lines.some((l) => l.words.some((w) => w.confidence !== undefined)));

    // Pessoa valida a primeira linha; reaplicar a transcrição a preserva.
    const validated = await v3.commitPatch(actor, created.project.id, { expectedRevisionId: doc.revisionId, operations: [{ op: 'validateLyrics', itemIds: [lines[0]!.id], validated: true }], origin: { author: 'human' } });
    const applied = await v3.applyLyricsTranscript(actor, created.project.id, { expectedRevisionId: validated.revisionId });
    const after = lyricLines((await v3.getProject(actor, created.project.id)).timeline!);
    assert.equal(after[0]!.id, lines[0]!.id);
    assert.equal(after[0]!.lyric!.status, 'VALIDATED');
    assert.ok(applied.skipped.length >= 1, 'a linha transcrita que cruza a validada é pulada');
  });
});
