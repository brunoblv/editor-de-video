import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildLyricsCompositionData,
  cinematicParamIssues,
  computeReactiveFrames,
  groupLyricWords,
  LYRICS_PRESETS,
  musicalMapSchema,
  parseEmphasisWords,
  parseScenesParam,
  planScenes,
  type GroupInputLine,
  type MusicalMap,
  type ReactiveOptions,
} from '../src/index.js';

const FPS = { num: 30, den: 1 };
const STEP = 20;

function map(durationMs = 30_000, over: Partial<Record<'rms' | 'bass' | 'treble', (ms: number) => number>> = {}): MusicalMap {
  const n = durationMs / STEP;
  const s = (fn?: (ms: number) => number) => Array.from({ length: n }, (_, i) => (fn ? fn(i * STEP) : 0.3));
  return musicalMapSchema.parse({
    schemaVersion: 1,
    audioHash: 'c'.repeat(64),
    durationMs,
    analysisVersion: 'test',
    bpmEstimate: null,
    beatTimesMs: [],
    onsets: [],
    features: { sampleIntervalMs: STEP, rms: s(over.rms), bass: s(over.bass), mids: s(), treble: s(over.treble) },
  });
}

/** Linha com uma palavra a cada `stepMs`; `long` estende a palavra desse índice (nota sustentada). */
function line(id: string, text: string, startMs: number, stepMs = 300, long = -1): GroupInputLine {
  let t = startMs;
  const words = text.split(' ').map((w, i) => {
    const dur = i === long ? stepMs * 4 : stepMs - 20;
    const out = { text: w, startMs: t, endMs: t + dur };
    t += i === long ? stepMs * 4 + 20 : stepMs;
    return out;
  });
  return { id, text, startMs, endMs: words[words.length - 1]!.endMs, words };
}

const opts = { mode: 'phrase' as const, maxWordsPerGroup: 4, maxLines: 3, emphasisWords: [], autoEmphasis: true };

describe('Cinematic: fragmentos da letra', () => {
  it('fragmentos curtos, equilibrados, sem cruzar a linha e com os tempos originais', () => {
    const lines = [line('a', 'eu vi o mar acender a noite inteira', 1000), line('b', 'e voltei', 5000)];
    const groups = groupLyricWords(lines, opts);
    // 8 palavras → 2 fragmentos de 4 (não 4+4 por acaso: equilibrado), depois "e voltei".
    assert.deepEqual(groups.map((g) => g.words.map((w) => w.text).join(' ')), ['eu vi o mar', 'acender a noite inteira', 'e voltei']);
    assert.ok(groups.every((g) => g.words.length <= 4));
    assert.deepEqual(new Set(groups.map((g) => g.lineId)), new Set(['a', 'b']));
    // Tempos das palavras não mudam.
    const flat = groups.flatMap((g) => g.words.map(({ text, startMs, endMs }) => ({ text, startMs, endMs })));
    assert.deepEqual(flat, lines.flatMap((l) => l.words!));
    // 5 palavras com máximo 4 → 3+2, nunca 4+1.
    const five = groupLyricWords([line('c', 'um dois três quatro cinco', 0)], opts);
    assert.deepEqual(five.map((g) => g.words.length), [3, 2]);
  });

  it('quebra na pontuação e em pausas longas', () => {
    const l = line('a', 'calma, eu fico aqui', 0);
    assert.deepEqual(groupLyricWords([l], opts).map((g) => g.words.length), [1, 3]);
    const paused: GroupInputLine = { id: 'p', text: 'longe perto', startMs: 0, endMs: 2000, words: [{ text: 'longe', startMs: 0, endMs: 300 }, { text: 'perto', startMs: 1500, endMs: 2000 }] };
    assert.equal(groupLyricWords([paused], opts).length, 2);
  });

  it('destaque: palavra da lista ou nota sustentada, em linha própria; híbrido vai palavra a palavra no canto lento', () => {
    const sustained = line('a', 'eu nunca vou esquecer', 0, 300, 3);
    const g = groupLyricWords([sustained], opts);
    assert.equal(g.length, 1);
    assert.deepEqual(g[0]!.words.filter((w) => w.emphasis).map((w) => w.text), ['esquecer']);
    assert.deepEqual(g[0]!.rows, [3, 1], 'destaque sozinho na última linha');

    const listed = groupLyricWords([line('b', 'meu Coração dispara agora', 0)], { ...opts, emphasisWords: parseEmphasisWords('coracao, mar') });
    assert.deepEqual(listed[0]!.words.filter((w) => w.emphasis).map((w) => w.text), ['Coração']);
    assert.deepEqual(listed[0]!.rows, [1, 1, 2]);

    // Híbrido: canto rápido fica em frase (destaque maior em linha própria); canto lento, palavra a palavra.
    const fast = groupLyricWords([line('c', 'meu coração dispara agora', 0)], { ...opts, mode: 'hybrid', emphasisWords: ['coracao'] });
    assert.deepEqual(fast.map((x) => x.words.map((w) => w.text).join(' ')), ['meu coração dispara agora']);
    assert.deepEqual(fast[0]!.rows, [1, 1, 2]);
    const slow = groupLyricWords([line('d', 'fica mais um pouco', 0, 900)], { ...opts, mode: 'hybrid' });
    assert.equal(slow.length, 4);
    // Uma palavra rápida + uma sustentada continuam juntas, com o destaque embaixo.
    const pair = groupLyricWords([line('e', 'virou luz', 0, 450, 1)], { ...opts, mode: 'hybrid' });
    assert.deepEqual(pair.map((x) => x.words.length), [2]);

    const off = groupLyricWords([sustained], { ...opts, autoEmphasis: false });
    assert.ok(off[0]!.words.every((w) => !w.emphasis));
  });

  it('modo palavra: uma por vez; linha sem tempo por palavra aparece inteira', () => {
    assert.equal(groupLyricWords([line('a', 'um dois três', 0)], { ...opts, mode: 'word' }).length, 3);
    const untimed = groupLyricWords([{ id: 'u', text: 'sem tempo por palavra aqui', startMs: 100, endMs: 2000, words: null }], opts);
    assert.equal(untimed.length, 1);
    assert.equal(untimed[0]!.timed, false);
    assert.equal(untimed[0]!.startMs, 100);
    assert.ok(untimed[0]!.rows.length <= 3);
  });
});

describe('Cinematic: cenas', () => {
  const lines = Array.from({ length: 10 }, (_, i) => line(`l${i}`, 'uma frase de quatro', 500 + i * 2800));
  const groups = groupLyricWords(lines, opts);
  const base = { entries: [], groups, sections: [], songStartMs: 0, durationMs: 30_000, minSceneMs: 6000, map: map() };

  it('por frase: cena dura várias frases, corta só em início de frase, sem grade fixa', () => {
    const scenes = planScenes({ ...base, policy: 'by_phrase' });
    assert.ok(scenes.length >= 3, `${scenes.length} cenas`);
    assert.equal(scenes[0]!.startMs, 0);
    assert.equal(scenes.at(-1)!.endMs, 30_000);
    for (const [i, s] of scenes.entries()) {
      if (i > 0) assert.equal(s.startMs, scenes[i - 1]!.endMs, 'contíguas');
      if (i < scenes.length - 1) assert.ok(s.endMs - s.startMs >= 6000, 'duração mínima');
      // Cada cena cobre mais de uma palavra; as que não são a última cobrem mais de uma frase.
      const inside = groups.filter((g) => g.startMs >= s.startMs && g.startMs < s.endMs);
      assert.ok(inside.flatMap((g) => g.words).length > 1);
      if (i < scenes.length - 1) assert.ok(inside.length > 1, `cena ${i} com ${inside.length} frase(s)`);
    }
    // Cortes caem logo antes de uma frase (nunca no meio de uma palavra).
    for (const s of scenes.slice(1)) assert.ok(groups.some((g) => g.startMs - s.startMs >= 0 && g.startMs - s.startMs <= 250));
    // Sem cenas configuradas: atmosferas procedurais em rodízio.
    assert.ok(scenes.every((s) => s.atmosphere && !s.file));
  });

  it('por seção, manual e sugerida pelo mapa', () => {
    const bySection = planScenes({ ...base, policy: 'by_section', sections: [{ startMs: 0, endMs: 12_000 }, { startMs: 12_000, endMs: 30_000 }] });
    assert.deepEqual(bySection.map((s) => [s.startMs, s.endMs]), [[0, 12_000], [12_000, 30_000]]);

    const entries = parseScenesParam(JSON.stringify([{ atmosphere: 'cosmos', startMs: 5000 }, { file: 'assets/scenes/a.jpg', startMs: 20_000 }]));
    const manual = planScenes({ ...base, entries, policy: 'manual', songStartMs: 2000 });
    assert.deepEqual(manual.map((s) => [s.startMs, s.endMs, s.file ?? s.atmosphere]), [[3000, 18_000, 'cosmos'], [18_000, 30_000, 'assets/scenes/a.jpg']]);

    // Energia sobe aos 14 s: a sugestão automática corta perto dali.
    const energetic = map(30_000, { rms: (ms) => (ms >= 14_000 ? 0.95 : 0.1), bass: (ms) => (ms >= 14_000 ? 0.9 : 0.1) });
    const ai = planScenes({ ...base, policy: 'ai_suggested', map: energetic });
    assert.ok(ai.some((s) => Math.abs(s.startMs - 14_000) < 1500), ai.map((s) => s.startMs).join(','));
    assert.deepEqual(planScenes({ ...base, policy: 'ai_suggested', map: energetic }), ai, 'determinístico');
  });

  it('valida cenas e exige o asset de cada imagem', () => {
    assert.throws(() => parseScenesParam('[{"file":"../../etc/passwd.jpg"}]'));
    assert.throws(() => parseScenesParam('[{"file":"assets/scenes/a.jpg","atmosphere":"ocean"}]'));
    assert.throws(() => parseScenesParam('[{"atmosphere":"praia"}]'));
    const scenes = JSON.stringify([{ file: 'assets/scenes/a.jpg' }]);
    assert.match(cinematicParamIssues({ scenes }).join(), /\$file:assets\/scenes\/a\.jpg/);
    assert.deepEqual(cinematicParamIssues({ scenes, '$file:assets/scenes/a.jpg': 'asset123' }), []);
    assert.match(cinematicParamIssues({ scenes: '[{"atmosphere":"ocean"}]', sceneChangePolicy: 'manual' }).join(), /startMs/);
  });
});

describe('Cinematic: reação ao som', () => {
  const cine = LYRICS_PRESETS.CINEMATIC_ATMOSPHERIC_LYRICS;
  const o = (x: Partial<ReactiveOptions> = {}): ReactiveOptions => ({ fps: FPS, startMs: 0, frameCount: 300, preset: 'cinematic', bindings: cine.bindings, intensity: 70, reducedMotion: false, limitFlashes: true, ...x });
  const bassUp = map(10_000, { bass: (ms) => (ms >= 4000 && ms < 6000 ? 1 : 0.2) });
  const trebleUp = map(10_000, { treble: (ms) => (ms >= 4000 && ms < 6000 ? 1 : 0.2) });
  const f = 150;

  it('graves dão microzoom no cenário e agudos dão brilho, com teto sutil', () => {
    const flat = computeReactiveFrames(map(10_000), o());
    const bass = computeReactiveFrames(bassUp, o());
    const treble = computeReactiveFrames(trebleUp, o());
    assert.ok(bass.bgScale[f]! > flat.bgScale[f]! + 0.01);
    assert.deepEqual(bass.bgBright, flat.bgBright);
    assert.ok(treble.bgBright[f]! > flat.bgBright[f]! + 0.03);
    assert.deepEqual(treble.bgScale, flat.bgScale);
    assert.ok(Math.max(...bass.bgScale) <= 1.06 && Math.max(...bass.scale) <= 1.06, 'sutil');
  });

  it('reação individual da letra e do cenário; intensidade 0 para tudo', () => {
    const noBg = computeReactiveFrames(bassUp, o({ backgroundReactivity: 0 }));
    assert.ok(noBg.bgScale.every((v) => v === 1));
    assert.ok(noBg.scale[f]! > 1, 'letra continua reagindo');
    const noText = computeReactiveFrames(bassUp, o({ textReactivity: 0 }));
    assert.ok(noText.scale.every((v) => v === 1));
    assert.ok(noText.bgScale[f]! > 1);
    const off = computeReactiveFrames(bassUp, o({ intensity: 0 }));
    assert.ok(off.bgScale.every((v) => v === 1) && off.bgBright.every((v) => v === 0) && off.scale.every((v) => v === 1));
    const reduced = computeReactiveFrames(bassUp, o({ reducedMotion: true }));
    assert.ok(reduced.bgScale.every((v) => v === 1), 'movimento reduzido tira o microzoom');
  });

  it('a reação não altera início/fim das palavras nem o agrupamento', () => {
    const lines = [{ itemId: 'l1', text: 'eu nunca vou esquecer', startFrame: 30, endFrame: 120, words: [
      { text: 'eu', startFrame: 30, endFrame: 39 }, { text: 'nunca', startFrame: 40, endFrame: 49 },
      { text: 'vou', startFrame: 50, endFrame: 59 }, { text: 'esquecer', startFrame: 60, endFrame: 120 },
    ] }];
    const params = { preset: 'cinematic', intensity: 100 };
    const quiet = buildLyricsCompositionData({ map: map(10_000), fps: FPS, frameCount: 300, songStartMs: 0, lines, params });
    const loud = buildLyricsCompositionData({ map: map(10_000, { bass: () => 1, treble: () => 1, rms: () => 1 }), fps: FPS, frameCount: 300, songStartMs: 0, lines, params });
    assert.deepEqual(loud.cinematic!.groups, quiet.cinematic!.groups);
    assert.notDeepEqual(loud.reactive.bgScale, quiet.reactive.bgScale);
    assert.equal(quiet.cinematic!.groups[0]!.words[0]!.startMs, 1000);
    // Híbrido (padrão): a nota sustentada fica no fragmento, maior e com os tempos dela.
    assert.deepEqual(quiet.cinematic!.groups.map((g) => g.words.map((w) => w.text).join(' ')), ['eu nunca vou esquecer']);
    assert.deepEqual(quiet.cinematic!.groups[0]!.words[3], { text: 'esquecer', startMs: 2000, endMs: 4000, emphasis: true });
    // Os presets anteriores não ganham dados do Cinematic.
    assert.equal(buildLyricsCompositionData({ map: map(10_000), fps: FPS, frameCount: 300, songStartMs: 0, lines, params: { preset: 'neon' } }).cinematic, undefined);
  });
});
