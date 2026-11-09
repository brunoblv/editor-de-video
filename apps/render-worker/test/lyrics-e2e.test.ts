/**
 * Reactive Lyrics ponta a ponta (Gate 3): projeto no hub → análise musical no
 * job ANALYZE → prévia completa e de trecho (consistentes) → MP4 final 16:9 e
 * 9:16 → ffprobe → palavra acende no frame editado → projeto reaberto.
 *
 * Requer V3_TEST_DATABASE_URL (banco DESCARTÁVEL migrado). Sem Redis: os jobs
 * ficam no banco e os handlers do worker rodam aqui. LYRICS_E2E_SEC define a
 * duração do trecho (padrão 6 s; a evidência do Gate 3 usa 30).
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const url = process.env.V3_TEST_DATABASE_URL;
const skip = !url || process.env.SKIP_HYPERFRAMES === '1';
const SEGMENT_SEC = Number(process.env.LYRICS_E2E_SEC ?? 6);
const KEEP = process.env.LYRICS_E2E_KEEP_DIR;
if (url) {
  process.env.DATABASE_URL = url;
  process.env.STORAGE_LOCAL_DIR = path.join(os.tmpdir(), `ev-lyrics-e2e-storage-${Date.now()}`);
  process.env.REDIS_URL = 'redis://127.0.0.1:1';
}

/** LRC original e curto: uma linha de uma palavra a cada 2 s, com tempo por palavra. */
function lyricsLrc(totalSec: number): string {
  const words = ['LUZ', 'NOITE', 'PULSO', 'CHAMA', 'VOZ', 'RITMO', 'MAR', 'SOL', 'FOGO', 'CÉU', 'RUA', 'TEMPO', 'ONDA', 'NORTE', 'BRILHO'];
  const clock = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${(sec % 60).toFixed(2).padStart(5, '0')}`;
  const rows: string[] = [];
  for (let i = 0, t = 1.4; t < totalSec - 0.5; i += 1, t += 2) rows.push(`[${clock(t)}]<${clock(t)}>${words[i % words.length]}`);
  rows.push(`[${clock(totalSec)}]`);
  return rows.join('\n');
}

describe('Reactive Lyrics ponta a ponta', { skip, timeout: 60 * 60_000 }, () => {
  let v3: typeof import('@editor-video/db/v3');
  let db: typeof import('@editor-video/db');
  let handleRender: typeof import('../src/handlers/render.js').handleRender;
  let handleAnalyze: typeof import('../src/handlers/analyze.js').handleAnalyze;
  let integrations: typeof import('@editor-video/integrations');
  const userId = `lyr-e2e-${randomUUID()}`;
  let dir: string;
  let wav: string;

  before(async () => {
    v3 = await import('@editor-video/db/v3');
    db = await import('@editor-video/db');
    integrations = await import('@editor-video/integrations');
    ({ handleRender } = await import('../src/handlers/render.js'));
    ({ handleAnalyze } = await import('../src/handlers/analyze.js'));
    await db.prisma.user.create({ data: { id: userId, email: `${userId}@test.local`, passwordHash: 'x' } });
    dir = KEEP ?? (await fsp.mkdtemp(path.join(os.tmpdir(), 'ev-lyrics-e2e-')));
    await fsp.mkdir(dir, { recursive: true });
    wav = path.join(dir, 'faixa.wav');
    // Faixa sintética original: bumbo a 120 BPM, chimbal no contratempo e graves mais fortes na segunda metade.
    const total = SEGMENT_SEC + 2;
    const expr = `(0.5+0.4*gte(t\\,${(total / 2).toFixed(2)}))*sin(2*PI*55*t)*exp(-18*mod(t\\,0.5))+0.4*sin(2*PI*7000*t)*sin(2*PI*9100*t)*exp(-60*mod(t+0.25\\,0.5))`;
    await integrations.runProcess(integrations.toolPaths().ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc=exprs='${expr}':s=44100:d=${total}`, '-ac', '2', wav]);
  });

  after(async () => {
    await v3.closeQueues();
    await db.prisma.$disconnect();
  });

  const runJob = async (jobId: string, kind: 'analyze' | 'render') => {
    const job = await v3.claimJob(jobId, 'e2e');
    assert.ok(job, 'job reivindicado');
    const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ev-lyrics-job-'));
    const started = Date.now();
    await (kind === 'analyze' ? handleAnalyze : handleRender)(job!, { workDir, signal: new AbortController().signal, progress: async () => undefined });
    await v3.finishJob(jobId, 'e2e', { state: 'SUCCEEDED' });
    return Date.now() - started;
  };

  const frameRgb = async (file: string, frame: number, width: number, height: number): Promise<Buffer> => {
    const out = path.join(dir, `f-${path.basename(file)}-${frame}.rgb`);
    await integrations.runProcess(integrations.toolPaths().ffmpeg, ['-v', 'error', '-y', '-i', file, '-vf', `select=eq(n\\,${frame}),scale=${width}:${height}`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', out]);
    return fsp.readFile(out);
  };
  /** Pixels no tom de destaque do Minimal (#F25C2A). */
  const accentPixels = (rgb: Buffer) => {
    let n = 0;
    for (let i = 0; i < rgb.length; i += 3) if (rgb[i]! > 190 && rgb[i + 1]! > 50 && rgb[i + 1]! < 140 && rgb[i + 2]! < 100) n += 1;
    return n;
  };

  it(`trecho de ${SEGMENT_SEC} s: análise, prévias, finais, frame exato e reabertura`, async () => {
    const actor = { userId };
    const workspaceId = await v3.ensureWorkspaceForUser(userId, 'Lyrics E2E');
    const channel = (await v3.listChannels(actor))[0]!;
    const audio = await v3.registerAssetFromFile(actor, { workspaceId, localPath: wav, originalName: 'faixa.wav', author: 'teste', license: 'sintética' });
    const created = await v3.createLyricsProject(actor, {
      channelId: channel.id,
      title: 'E2E Lyrics',
      formats: ['16:9', '9:16'],
      audioAssetId: audio.id,
      lyrics: { content: lyricsLrc(SEGMENT_SEC + 2), fileName: 'letra.lrc' },
      language: 'pt-BR',
      presetId: 'MINIMAL_LYRICS',
      segmentStartMs: 1000,
      segmentDurationMs: SEGMENT_SEC * 1000,
      rights: { declared: true, note: 'faixa sintética gerada no teste' },
    });
    const projectId = created.project.id;
    const timings: Record<string, number> = {};

    // 1. Análise musical pelo handler do worker.
    timings.analysis = await runJob(created.analysisJobId, 'analyze');
    const state = await v3.getLyricsState(actor, projectId);
    assert.ok(state.analysis.ready, 'mapa musical gravado');
    assert.ok(Math.abs((state.analysis.bpm ?? 0) - 120) < 3);

    // 2. Edição de tempo: a primeira palavra passa a começar 3 frames depois.
    const { lyricLines } = await import('@editor-video/timeline');
    const doc0 = (await v3.getProject(actor, projectId)).timeline!;
    const first = lyricLines(doc0)[0]!;
    const editedStart = first.words[0]!.start + 3;
    const edited = await v3.commitPatch(actor, projectId, {
      expectedRevisionId: doc0.revisionId,
      operations: [{ op: 'setLyricLine', itemId: first.id, timelineStart: first.timelineStart + 3, duration: first.duration - 3, words: [{ ...first.words[0]!, start: editedStart }] }],
      origin: { author: 'human' },
      summary: 'Primeira palavra 3 frames depois',
    });

    // 3. Prévia completa e prévia de trecho: mesmo instante, mesma imagem.
    const full = await v3.requestRender(actor, { revisionId: edited.revisionId, quality: 'preview' });
    timings.previewFull = await runJob(full.jobId, 'render');
    const range = { startFrame: 60, endFrame: 120 };
    const part = await v3.requestRender(actor, { revisionId: edited.revisionId, quality: 'preview', range });
    timings.previewRange = await runJob(part.jobId, 'render');
    const storage = (await import('@editor-video/core/server')).getStorage();
    const fullD = await db.prisma.deliverable.findUniqueOrThrow({ where: { id: full.deliverableId } });
    const partD = await db.prisma.deliverable.findUniqueOrThrow({ where: { id: part.deliverableId } });
    assert.equal(partD.state, 'READY');
    assert.ok(Math.abs((partD.durationSec ?? 0) - 2) < 0.05, `trecho com ${partD.durationSec} s`);
    const fullFile = await storage.toLocalPath(fullD.storageKey!);
    const partFile = await storage.toLocalPath(partD.storageKey!);
    for (const offset of [5, 30, 55]) {
      const a = await frameRgb(fullFile, range.startFrame + offset, 240, 136);
      const b = await frameRgb(partFile, offset, 240, 136);
      let diff = 0;
      for (let i = 0; i < a.length; i += 1) diff += Math.abs(a[i]! - b[i]!);
      assert.ok(diff / a.length < 3, `frame ${range.startFrame + offset}: prévia de trecho difere da completa (média ${(diff / a.length).toFixed(2)})`);
    }

    // 4. Finais 16:9 e 9:16 com ffprobe.
    const finals: Record<string, string> = {};
    for (const variantId of [null, 'v-9x16']) {
      const r = await v3.requestRender(actor, { revisionId: edited.revisionId, quality: 'final', variantId });
      timings[`final${variantId ? '9x16' : '16x9'}`] = await runJob(r.jobId, 'render');
      const d = await db.prisma.deliverable.findUniqueOrThrow({ where: { id: r.deliverableId } });
      assert.equal(d.state, 'READY');
      assert.equal(d.sha256?.length, 64);
      const file = await storage.toLocalPath(d.storageKey!);
      const info = await integrations.inspectMedia(file);
      assert.equal(info.video?.codec, 'h264');
      assert.equal(info.audio?.codec, 'aac');
      assert.equal(info.video?.displayWidth, variantId ? 1080 : 1920);
      assert.equal(info.video?.displayHeight, variantId ? 1920 : 1080);
      assert.ok(Math.abs((info.durationSec ?? 0) - SEGMENT_SEC) < 0.1, `duração ${info.durationSec}`);
      finals[variantId ?? 'main'] = file;
      if (KEEP) await fsp.copyFile(file, path.join(KEEP, `final-${variantId ? '9x16' : '16x9'}.mp4`));
    }
    if (KEEP) {
      await fsp.copyFile(fullFile, path.join(KEEP, 'preview-full.mp4'));
      await fsp.copyFile(partFile, path.join(KEEP, 'preview-range.mp4'));
    }

    // 5. A palavra editada acende exatamente no frame editado (sem drift > 1 frame).
    // (A barra de progresso do Minimal tem a mesma cor e cresce devagar: mede-se o salto.)
    const earlier = accentPixels(await frameRgb(finals.main!, editedStart - 2, 1920, 1080));
    const before = accentPixels(await frameRgb(finals.main!, editedStart - 1, 1920, 1080));
    const at = accentPixels(await frameRgb(finals.main!, editedStart, 1920, 1080));
    assert.ok(Math.abs(before - earlier) < 100, `nada acende antes: ${earlier} → ${before} px`);
    assert.ok(at - before > 1000, `destaque no frame ${editedStart - 1}: ${before} px; no ${editedStart}: ${at} px`);

    // 6. Reabrir: revisão, letra e entregas persistidas.
    const reopened = await v3.getProject(actor, projectId);
    assert.equal(reopened.currentRevisionId, edited.revisionId);
    assert.equal(lyricLines(reopened.timeline!)[0]!.words[0]!.start, editedStart);
    const deliverables = await db.prisma.deliverable.findMany({ where: { projectId, state: 'READY' } });
    assert.equal(deliverables.length, 4);
    console.log(`tempos (ms) para ${SEGMENT_SEC} s: ${JSON.stringify(timings)}`);
    if (KEEP) await fsp.writeFile(path.join(KEEP, 'timings.json'), JSON.stringify({ segmentSec: SEGMENT_SEC, timings, editedStartFrame: editedStart, accentPixels: { before, at } }, null, 2));
  });
});
