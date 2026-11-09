/**
 * Gate 0 do Reactive Lyrics com Hyperframes real: o frame renderizado muda
 * quando o MusicalMap muda (e só por causa dele), e a mesma entrada dá o
 * mesmo frame. Pule com SKIP_HYPERFRAMES=1.
 */
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { buildLyricsDataScript, LYRICS_PRESETS, musicalMapSchema, type LyricsPresetId, type MusicalMap } from '@editor-video/domain';
import { renderComposition, runProcess, toolPaths } from '@editor-video/integrations';
import { validateTemplateParams } from '@editor-video/templates';
import { createTimeline } from '@editor-video/timeline';
import { compileTimeline } from '@editor-video/timeline/compile';
import { seedLyricsTimeline } from '@editor-video/domain';
import { lyricsDataForLayer } from '../src/lyrics-composition.js';

const skip = process.env.SKIP_HYPERFRAMES === '1';
const W = 180;
const H = 320;

function map(bass: number, treble: number, rms: number): MusicalMap {
  const n = 150; // 3 s a 20 ms
  const fill = (v: number) => new Array(n).fill(v);
  return musicalMapSchema.parse({
    schemaVersion: 1,
    audioHash: 'a'.repeat(64),
    durationMs: 3000,
    analysisVersion: 'test',
    bpmEstimate: null,
    beatTimesMs: [],
    onsets: [],
    features: { sampleIntervalMs: 20, rms: fill(rms), bass: fill(bass), mids: fill(0.3), treble: fill(treble) },
  });
}

/** Renderiza 1 s do preset e devolve os pixels RGB do frame em 0,5 s (linha inteira na tela). */
async function renderFrame(m: MusicalMap, dir: string, name: string, presetId: LyricsPresetId = 'NEON_CINEMATIC', extra: Record<string, unknown> = {}): Promise<Buffer> {
  const seeded = seedLyricsTimeline(createTimeline({ projectId: 'g0', revisionId: 'g0', width: W, height: H }), {
    audio: { assetId: 'song', hash: 'a'.repeat(64), kind: 'audio', sourceTimebase: { num: 48000, den: 1 }, durationUnits: 48000 * 3, hasAudio: true },
    segmentStartMs: 1000,
    segmentDurationMs: 1000,
    lines: [{ text: 'luz', stanza: 0, startMs: 1000, endMs: 2000, status: 'SUGGESTED', source: 'import', words: [] }],
    presetId,
  });
  const plan = compileTimeline(seeded.doc, { quality: 'final' });
  const layer = plan.video[0]!;
  const values = validateTemplateParams('reactive-lyrics', { ...layer.params, intensity: 100, ...extra });
  assert.ok(values.ok);
  const dataFile = path.join(dir, `${name}.js`);
  await fsp.writeFile(dataFile, buildLyricsDataScript(lyricsDataForLayer(plan, layer, m, 'song', values.values)));
  const out = path.join(dir, `${name}.mp4`);
  await renderComposition({
    templateSlug: 'reactive-lyrics',
    templateVersion: 1,
    params: values.values,
    width: W,
    height: H,
    durationSec: 1,
    quality: 'final',
    workDir: path.join(dir, `hf-${name}`),
    outputPath: out,
    files: { 'assets/lyrics-data.js': dataFile },
    timeoutMs: 8 * 60_000,
  });
  const raw = path.join(dir, `${name}.rgb`);
  await runProcess(toolPaths().ffmpeg, ['-v', 'error', '-y', '-ss', '0.5', '-i', out, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw]);
  return fsp.readFile(raw);
}

/** Fração de pixels com diferença visível (> 12 níveis em algum canal). */
const changedPixels = (a: Buffer, b: Buffer) => {
  assert.equal(a.length, b.length);
  let changed = 0;
  for (let i = 0; i < a.length; i += 3) {
    if (Math.abs(a[i]! - b[i]!) > 12 || Math.abs(a[i + 1]! - b[i + 1]!) > 12 || Math.abs(a[i + 2]! - b[i + 2]!) > 12) changed += 1;
  }
  return changed / (a.length / 3);
};

describe('Reactive Lyrics com Hyperframes', { skip }, () => {
  it('o frame muda com o mapa musical e é reprodutível', async () => {
    assert.ok(LYRICS_PRESETS.NEON_CINEMATIC.bindings.some((b) => b.source === 'treble' && b.target === 'glow'));
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ev-lyrics-g0-'));
    const quiet = await renderFrame(map(0.1, 0.1, 0.2), dir, 'quiet');
    const again = await renderFrame(map(0.1, 0.1, 0.2), dir, 'again');
    const loud = await renderFrame(map(1, 1, 1), dir, 'loud');
    const same = changedPixels(quiet, again);
    const changed = changedPixels(quiet, loud);
    console.log(`pixels alterados: mesma entrada ${(same * 100).toFixed(2)}%, mapa alterado ${(changed * 100).toFixed(2)}%`);
    assert.equal(same, 0, 'mesma entrada deveria dar exatamente o mesmo frame');
    assert.ok(changed > 0.01, `graves, agudos e energia altos deveriam mudar o frame (${(changed * 100).toFixed(2)}% dos pixels)`);
  });

  it('Cinematic: cenário reage ao som, é reprodutível e para com intensidade 0', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ev-lyrics-cine-'));
    const scene = { scenes: JSON.stringify([{ atmosphere: 'rose_moon' }]) };
    const quiet = await renderFrame(map(0.1, 0.1, 0.2), dir, 'c-quiet', 'CINEMATIC_ATMOSPHERIC_LYRICS', scene);
    const again = await renderFrame(map(0.1, 0.1, 0.2), dir, 'c-again', 'CINEMATIC_ATMOSPHERIC_LYRICS', scene);
    const loud = await renderFrame(map(1, 1, 1), dir, 'c-loud', 'CINEMATIC_ATMOSPHERIC_LYRICS', scene);
    const quietOff = await renderFrame(map(0.1, 0.1, 0.2), dir, 'c-quiet-off', 'CINEMATIC_ATMOSPHERIC_LYRICS', { ...scene, intensity: 0 });
    const loudOff = await renderFrame(map(1, 1, 1), dir, 'c-loud-off', 'CINEMATIC_ATMOSPHERIC_LYRICS', { ...scene, intensity: 0 });
    const changed = changedPixels(quiet, loud);
    console.log(`Cinematic: mesma entrada ${(changedPixels(quiet, again) * 100).toFixed(2)}%, mapa alterado ${(changed * 100).toFixed(2)}%, intensidade 0 ${(changedPixels(quietOff, loudOff) * 100).toFixed(2)}%`);
    assert.equal(changedPixels(quiet, again), 0);
    assert.ok(changed > 0.01, `microzoom/brilho deveriam mudar o frame (${(changed * 100).toFixed(2)}%)`);
    assert.equal(changedPixels(quietOff, loudOff), 0, 'com intensidade 0 o mapa não muda nada');
  });
});
