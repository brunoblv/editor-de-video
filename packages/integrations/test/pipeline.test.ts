/**
 * Integração real com FFmpeg (sem mocks): gera mídia sintética, monta uma
 * timeline, renderiza prévia/final em 16:9 e 9:16 e valida os MP4.
 */
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { before, describe, it } from 'node:test';
import { addVariant, applyPatch, createTimeline, originSchema, parseItem, removeRangeOps } from '@editor-video/timeline';
import { compileTimeline } from '@editor-video/timeline/compile';
import {
  assembleLongFromSegment,
  exportResolvePackage,
  hashFile,
  inspectMedia,
  makeProxy,
  makeSeamlessSegment,
  renderPlanWithFfmpeg,
  runProcess,
  toolPaths,
  validateOutput,
  verifySeams,
} from '../src/index.js';

let dir: string;
let clipA: string;
let music: string;

before(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ev-int-'));
  clipA = path.join(dir, 'a.mp4');
  music = path.join(dir, 'm.wav');
  const { ffmpeg } = toolPaths();
  await runProcess(ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=8', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clipA]);
  await runProcess(ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.2:duration=30', '-ar', '48000', music]);
});

describe('pipeline real FFmpeg', () => {
  it('inspeciona, faz hash e proxy', async () => {
    const info = await inspectMedia(clipA);
    assert.equal(info.video?.width, 1280);
    assert.equal(info.video?.fpsNum, 30);
    assert.ok(info.audio);
    const hash = await hashFile(clipA);
    assert.equal(hash.length, 64);
    const proxy = path.join(dir, 'proxy.mp4');
    await makeProxy(clipA, proxy, { height: 360 });
    const pinfo = await inspectMedia(proxy);
    assert.equal(pinfo.video?.height, 360);
    assert.equal(await hashFile(clipA), hash, 'original permanece imutável');
  });

  it('renderiza prévia e final 16:9 e 9:16 com textos/legendas e valida', async () => {
    const hash = await hashFile(clipA);
    let doc = createTimeline({ projectId: 'p1', revisionId: 'r1', width: 1280, height: 720 });
    doc.assets = {
      a: { assetId: 'a', hash, kind: 'video', sourceTimebase: { num: 30, den: 1 }, durationUnits: 240, width: 1280, height: 720, hasAudio: true },
      m: { assetId: 'm', hash: 'm'.repeat(64), kind: 'audio', sourceTimebase: { num: 48000, den: 1 }, durationUnits: 48000 * 30, hasAudio: true },
    };
    doc.tracks[0]!.items.push(
      parseItem({ id: 'c1', kind: 'clip', assetId: 'a', sourceIn: 0, sourceOut: 90, timelineStart: 0, duration: 90 }),
      parseItem({ id: 'c2', kind: 'clip', assetId: 'a', sourceIn: 150, sourceOut: 240, timelineStart: 90, duration: 90 }),
    );
    doc.tracks[1]!.items.push(parseItem({ id: 'm1', kind: 'clip', assetId: 'm', sourceIn: 0, sourceOut: 48000 * 6, timelineStart: 0, duration: 180, audio: { gainDb: -12, fadeOutFrames: 30 } }));
    doc.tracks[2]!.items.push(parseItem({ id: 't1', kind: 'text', text: 'Título de teste', timelineStart: 0, duration: 60 }));
    doc.tracks[3]!.items.push(parseItem({ id: 's1', kind: 'caption', text: 'Legenda com acentuação', timelineStart: 60, duration: 60 }));
    doc.video.durationFrames = 180;
    doc = addVariant(doc, '9:16');

    // Comando editorial: remove 1s no meio (ripple) → 5s.
    const result = applyPatch(
      doc,
      { expectedRevisionId: 'r1', operations: removeRangeOps(doc, 75, 105, (p) => `${p}x`), origin: originSchema.parse({ author: 'agent', command: 'corta 1s' }) },
      { newRevisionId: 'r2' },
    );
    assert.ok(result.ok, JSON.stringify(!result.ok && result.error));
    if (!result.ok) return;
    const edited = result.document;
    assert.equal(edited.video.durationFrames, 150);

    const proxy = path.join(dir, 'proxy.mp4');
    const resolveAsset = async (assetId: string, useProxy: boolean) => ({
      path: assetId === 'm' ? music : useProxy ? proxy : clipA,
      kind: assetId === 'm' ? 'audio' : 'video',
    });

    for (const variantId of [null, 'v-9x16'] as const) {
      for (const quality of ['preview', 'final'] as const) {
        const plan = compileTimeline(edited, { variantId, quality });
        const out = path.join(dir, `${variantId ?? 'base'}-${quality}.mp4`);
        let lastProgress = 0;
        await renderPlanWithFfmpeg({ plan, outputPath: out, workDir: path.join(dir, `work-${variantId}-${quality}`), resolveAsset, onProgress: (p) => (lastProgress = p) });
        assert.equal(lastProgress, 1);
        const report = await validateOutput(out, {
          durationSec: plan.durationSec,
          width: plan.width,
          height: plan.height,
          fpsNum: 30,
          fpsDen: 1,
          expectAudio: true,
          fullDecode: true,
          measureLoudness: quality === 'final',
        });
        assert.ok(report.ok, JSON.stringify(report.checks.filter((c) => c.status === 'fail')));
      }
    }
  });

  it('exporta pacote Resolve com EDL, SRT e limitações', async () => {
    const hash = await hashFile(clipA);
    const doc = createTimeline({ projectId: 'p1', revisionId: 'r9', width: 1280, height: 720 });
    doc.assets = { a: { assetId: 'a', hash, kind: 'video', sourceTimebase: { num: 30, den: 1 }, durationUnits: 240, width: 1280, height: 720, hasAudio: true } };
    doc.tracks[0]!.items.push(parseItem({ id: 'c1', kind: 'clip', assetId: 'a', sourceIn: 30, sourceOut: 120, timelineStart: 0, duration: 90, transform: { scale: 1.2 } }));
    doc.tracks[2]!.items.push(parseItem({ id: 't1', kind: 'text', text: 'Título', timelineStart: 0, duration: 30 }));
    doc.tracks[3]!.items.push(parseItem({ id: 's1', kind: 'caption', text: 'Oi', timelineStart: 0, duration: 30 }));
    doc.video.durationFrames = 90;
    const out = path.join(dir, 'resolve');
    const manifest = await exportResolvePackage({ doc, outDir: out, resolveOriginal: async () => ({ path: clipA, originalName: 'a.mp4' }) });
    const edl = await fsp.readFile(path.join(out, 'V1.edl'), 'utf8');
    assert.match(edl, /001 {2}A001 {5}V {5}C {8}00:00:01:00 00:00:04:00 00:00:00:00 00:00:03:00/);
    assert.ok(manifest.limitations.some((l) => l.itemId === 't1'));
    assert.ok(manifest.limitations.some((l) => l.kind === 'transform'));
    assert.match(await fsp.readFile(path.join(out, 'C1.srt'), 'utf8'), /00:00:00,000 --> 00:00:01,000/);
  });

  it('AC-13: Ambient longo por segmento em loop, sem re-encode, com emendas verificadas', async () => {
    const raw = path.join(dir, 'amb-raw.mp4');
    const { ffmpeg } = toolPaths();
    await runProcess(ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x0B1020:size=640x360:rate=30:duration=12', '-i', music, '-t', '12', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', raw]);
    const seg = path.join(dir, 'amb-seg.mp4');
    await makeSeamlessSegment(raw, seg, { segmentSec: 12, crossfadeSec: 2 });
    const segInfo = await inspectMedia(seg);
    const segSec = segInfo.durationSec!;
    const long = path.join(dir, 'amb-long.mp4');
    const { seamsSec } = await assembleLongFromSegment(seg, segSec, 45, long, { workDir: path.join(dir, 'amb-work') });
    assert.ok(seamsSec.length >= 3);
    const report = await validateOutput(long, { durationSec: 45, durationToleranceSec: 1, width: 640, height: 360, fpsNum: 30, fpsDen: 1, expectAudio: true, skipBlackSilence: true });
    assert.ok(report.ok, JSON.stringify(report.checks));
    const seams = await verifySeams(long, seamsSec);
    assert.ok(seams.every((s) => s.ok), JSON.stringify(seams));
  });
});
