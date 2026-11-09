import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTimeline, lyricLines, validateSemantics } from '@editor-video/timeline';
import {
  buildLyricsCompositionData,
  buildLyricsDataScript,
  computeReactiveFrames,
  effectBindingSchema,
  FLASH_MIN_GAP_MS,
  LYRICS_PRESETS,
  musicalMapSchema,
  parseBindingsParam,
  parseLyrics,
  parseSectionsParam,
  seedLyricsTimeline,
  transcriptToLyricLines,
  type MusicalMap,
  type ReactiveOptions,
} from '../src/index.js';

const FPS = { num: 30, den: 1 };
const STEP = 20;

/** Mapa sintético de 10 s: séries constantes que o teste altera por trecho. */
function syntheticMap(over: Partial<Record<'rms' | 'bass' | 'mids' | 'treble', (i: number) => number>> = {}, onsetsEveryMs = 0): MusicalMap {
  const n = 500;
  const series = (fn?: (i: number) => number) => Array.from({ length: n }, (_, i) => (fn ? fn(i) : 0.3));
  const onsets = onsetsEveryMs ? Array.from({ length: Math.floor(10_000 / onsetsEveryMs) - 1 }, (_, i) => ({ timeMs: (i + 1) * onsetsEveryMs, strength: 0.9 })) : [];
  return musicalMapSchema.parse({
    schemaVersion: 1,
    audioHash: 'e'.repeat(64),
    durationMs: 10_000,
    analysisVersion: 'test',
    bpmEstimate: null,
    beatTimesMs: [],
    onsets,
    features: { sampleIntervalMs: STEP, rms: series(over.rms), bass: series(over.bass), mids: series(over.mids), treble: series(over.treble) },
  });
}

const base = (o: Partial<ReactiveOptions> = {}): ReactiveOptions => ({
  fps: FPS,
  startMs: 0,
  frameCount: 300,
  preset: 'neon',
  bindings: LYRICS_PRESETS.NEON_CINEMATIC.bindings,
  intensity: 70,
  reducedMotion: false,
  limitFlashes: true,
  ...o,
});

// Graves altos de 4 a 6 s; agudos altos de 7 a 9 s.
const boostBass = (i: number) => (i * STEP >= 4000 && i * STEP < 6000 ? 1 : 0.3);
const boostTreble = (i: number) => (i * STEP >= 7000 && i * STEP < 9000 ? 1 : 0.3);
const frameAt = (ms: number) => Math.round((ms * 30) / 1000);

describe('vínculos reativos', () => {
  it('mudar os graves muda a escala e não o brilho', () => {
    const flat = computeReactiveFrames(syntheticMap(), base());
    const bass = computeReactiveFrames(syntheticMap({ bass: boostBass }), base());
    const f = frameAt(5000);
    assert.ok(bass.scale[f]! > flat.scale[f]! + 0.02, `escala ${bass.scale[f]} vs ${flat.scale[f]}`);
    assert.deepEqual(bass.glow, flat.glow);
    assert.deepEqual(bass.bgOpacity, flat.bgOpacity);
    // Fora do trecho alterado (e longe da suavização) nada muda.
    assert.equal(bass.scale[frameAt(2000)], flat.scale[frameAt(2000)]);
  });

  it('mudar os agudos muda o brilho e não a escala', () => {
    const flat = computeReactiveFrames(syntheticMap(), base());
    const treble = computeReactiveFrames(syntheticMap({ treble: boostTreble }), base());
    const f = frameAt(8000);
    assert.ok(treble.glow[f]! > flat.glow[f]! + 0.3, `brilho ${treble.glow[f]} vs ${flat.glow[f]}`);
    assert.deepEqual(treble.scale, flat.scale);
  });

  it('intensidade 0 desliga tudo; movimento reduzido remove escala e partículas', () => {
    const map = syntheticMap({ bass: boostBass, treble: boostTreble }, 500);
    const off = computeReactiveFrames(map, base({ intensity: 0 }));
    assert.ok(off.scale.every((v) => v === 1) && off.glow.every((v) => v === 0) && off.particles.length === 0);
    const full = computeReactiveFrames(map, base());
    const reduced = computeReactiveFrames(map, base({ reducedMotion: true }));
    assert.ok(full.particles.length > 0);
    assert.ok(reduced.scale.every((v) => v === 1));
    assert.equal(reduced.particles.length, 0);
    assert.ok(Math.max(...reduced.glow) < Math.max(...full.glow), 'brilho pela metade');
  });

  it('limite de flashes: no máximo 3 eventos por segundo', () => {
    const map = syntheticMap({}, 100);
    const binding = effectBindingSchema.parse({ source: 'onset', target: 'glitch', threshold: 0.1 });
    const limited = computeReactiveFrames(map, base({ preset: 'glitch_rock', bindings: [binding] }));
    const gaps = limited.glitches.slice(1).map((e, i) => ((e.frame - limited.glitches[i]!.frame) * 1000) / 30);
    assert.ok(gaps.every((g) => g >= FLASH_MIN_GAP_MS - 34), `intervalos ${gaps.join(',')}`);
    const free = computeReactiveFrames(map, base({ preset: 'glitch_rock', bindings: [binding], limitFlashes: false }));
    assert.ok(free.glitches.length > limited.glitches.length * 2);
  });

  it('é determinístico e o trecho dá o mesmo valor do render completo', () => {
    const map = syntheticMap({ bass: boostBass, treble: boostTreble }, 400);
    const opts = base({ preset: 'glitch_rock', bindings: LYRICS_PRESETS.GLITCH_ROCK.bindings });
    const a = computeReactiveFrames(map, opts);
    assert.deepEqual(computeReactiveFrames(map, opts), a);
    // Trecho começando em 4 s (frame 120): mesma suavização e mesmos eventos.
    const seg = computeReactiveFrames(map, { ...opts, startMs: 4000, frameCount: 90 });
    assert.deepEqual(seg.scale, a.scale.slice(120, 210));
    assert.deepEqual(seg.dx, a.dx.slice(120, 210));
    assert.deepEqual(seg.glitches.map((e) => e.frame + 120), a.glitches.filter((e) => e.frame >= 120 && e.frame < 210).map((e) => e.frame));
  });

  it('seção de refrão intensifica e verso suaviza (exceto Minimal)', () => {
    const map = syntheticMap({ bass: () => 0.8 });
    const sections = parseSectionsParam('0-5000:verse;5000-10000:chorus');
    const r = computeReactiveFrames(map, base({ sections }));
    assert.ok(r.scale[frameAt(7000)]! > r.scale[frameAt(3000)]!);
    const minimal = computeReactiveFrames(map, base({ preset: 'minimal', bindings: LYRICS_PRESETS.MINIMAL_LYRICS.bindings, sections }));
    assert.equal(minimal.scale[frameAt(7000)], minimal.scale[frameAt(3000)]);
  });

  it('valida vínculos, seções e JSON de vínculos', () => {
    assert.throws(() => effectBindingSchema.parse({ source: 'bass', target: 'scale', clampMin: 0.8, clampMax: 0.2 }));
    assert.throws(() => effectBindingSchema.parse({ source: 'kick', target: 'scale' }));
    assert.throws(() => parseSectionsParam('0-1000:refrao'));
    assert.throws(() => parseSectionsParam('0-1000:verse;500-2000:chorus'), /sobrepostas/);
    assert.equal(parseBindingsParam('', 'glitch_rock'), LYRICS_PRESETS.GLITCH_ROCK.bindings);
    assert.equal(parseBindingsParam('[{"source":"rms","target":"glow","gain":2}]', 'neon')[0]!.gain, 2);
    assert.throws(() => parseBindingsParam('[{"source":"rms","target":"explode"}]', 'neon'));
  });
});

describe('timeline e dados da composição', () => {
  it('monta A1/V1/L1 e gera dados com frames exatos', () => {
    const doc = createTimeline({ projectId: 'p', revisionId: 'r', width: 1080, height: 1920 });
    const alignment = parseLyrics('[00:01.00]<00:01.00>A <00:01.50>luz\n[00:03.00]segunda linha\n[00:05.00]', 'lrc', { durationMs: 10_000 });
    const seeded = seedLyricsTimeline(doc, {
      audio: { assetId: 'song', hash: 'f'.repeat(64), kind: 'audio', sourceTimebase: { num: 44100, den: 1 }, durationUnits: 44100 * 10, hasAudio: true },
      segmentStartMs: 500,
      segmentDurationMs: 6000,
      lines: alignment.lines,
      presetId: 'GLITCH_ROCK',
    });
    assert.deepEqual(validateSemantics(seeded.doc), []);
    assert.equal(seeded.segmentFrames, 180);
    assert.equal(seeded.doc.output.loudnessProfile, 'none');
    const lines = lyricLines(seeded.doc);
    assert.deepEqual(lines.map((l) => [l.timelineStart, l.duration]), [[15, 60], [75, 60]]);

    const data = buildLyricsCompositionData({
      map: syntheticMap({ bass: boostBass }),
      fps: FPS,
      frameCount: 180,
      songStartMs: 500,
      lines: lines.map((l) => ({ itemId: l.id, text: l.text, startFrame: l.timelineStart, endFrame: l.timelineStart + l.duration, words: l.words.length ? l.words.map((w) => ({ text: w.text, startFrame: w.start, endFrame: w.end })) : null })),
      params: { preset: 'glitch_rock', intensity: 70 },
    });
    assert.equal(data.reactive.scale.length, 180);
    assert.deepEqual(data.lines[0]!.words!.map((w) => w.startMs), [500, 1000]);
    assert.equal(data.lines[1]!.words, null);
    const karaokeOff = buildLyricsCompositionData({ map: syntheticMap(), fps: FPS, frameCount: 180, songStartMs: 500, lines: [{ itemId: 'x', text: 'a b', startFrame: 0, endFrame: 30, words: [{ text: 'a', startFrame: 0, endFrame: 10 }, { text: 'b', startFrame: 10, endFrame: 30 }] }], params: { highlightMode: 'line' } });
    assert.equal(karaokeOff.lines[0]!.words, null);
  });

  it('o script de dados não permite fechar a tag nem injetar código', () => {
    const script = buildLyricsDataScript({ version: 2, fps: FPS, frameCount: 1, lines: [{ id: 'x', text: '</script><script>alert(1)</script>', startMs: 0, endMs: 10, words: null }], reactive: { scale: [1], glow: [0], bgOpacity: [1], dx: [0], dy: [0], split: [0] }, particles: [], glitches: [] });
    assert.doesNotMatch(script, /<\/script>/);
    const sandbox: { window: { __LYRICS__?: { lines: Array<{ text: string }> } } } = { window: {} };
    new Function('window', script)(sandbox.window);
    assert.equal(sandbox.window.__LYRICS__!.lines[0]!.text, '</script><script>alert(1)</script>');
  });
});

describe('letra transcrita', () => {
  it('vira linhas asr com tempo por palavra, nunca validadas; confiança baixa marca a linha', () => {
    const lines = transcriptToLyricLines(
      [
        { text: 'All right, so here we are', startSec: 0.96, endSec: 2.02, words: [
          { text: 'All', startSec: 0.96, endSec: 1.36, confidence: 0.25 },
          { text: 'right,', startSec: 1.36, endSec: 1.46, confidence: 0.99 },
          { text: 'so', startSec: 1.46, endSec: 1.6, confidence: 0.96 },
        ] },
        { text: 'longa', startSec: 3, endSec: 9, words: Array.from({ length: 12 }, (_, i) => ({ text: `p${i}`, startSec: 3 + i * 0.4 + (i >= 7 ? 1 : 0), endSec: 3.3 + i * 0.4 + (i >= 7 ? 1 : 0), confidence: 0.9 })) },
        { text: 'sem palavras', startSec: 10, endSec: 11, words: [] },
      ],
      30,
    );
    assert.deepEqual(lines.map((l) => [l.text, l.status, l.source]), [
      ['All right, so', 'LOW_CONFIDENCE', 'aligner'],
      ['p0 p1 p2 p3 p4 p5 p6', 'SUGGESTED', 'aligner'],
      ['p7 p8 p9 p10 p11', 'SUGGESTED', 'aligner'],
      ['sem palavras', 'SUGGESTED', 'aligner'],
    ]);
    assert.equal(lines[0]!.startMs, 30_960, 'deslocado pelo início do trecho');
    assert.equal(lines[0]!.words[0]!.confidence, 0.25);
    assert.ok(lines.every((l) => l.status !== 'VALIDATED'));
    // Na timeline a origem vira 'asr' e a confiança fica por palavra.
    const doc = createTimeline({ projectId: 'p', revisionId: 'r', width: 1080, height: 1920 });
    const seeded = seedLyricsTimeline(doc, {
      audio: { assetId: 'song', hash: 'f'.repeat(64), kind: 'audio', sourceTimebase: { num: 48000, den: 1 }, durationUnits: 48000 * 60, hasAudio: true },
      segmentStartMs: 30_000,
      segmentDurationMs: 15_000,
      lines,
      presetId: 'NEON_CINEMATIC',
    });
    const first = lyricLines(seeded.doc)[0]!;
    assert.deepEqual(first.lyric, { stanza: 0, status: 'LOW_CONFIDENCE', source: 'asr' });
    assert.equal(first.words[0]!.confidence, 0.25);
  });
});
