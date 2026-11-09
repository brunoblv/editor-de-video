import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyPatch,
  createTimeline,
  framesToMs,
  lyricIssuesInTimeline,
  lyricItemsFromImport,
  lyricLines,
  msToFrames,
  parseItem,
  parseTimeline,
  validateSemantics,
  type CaptionItem,
  type TimelineDocument,
  type TimelineOperation,
} from '../src/index.js';
import { compileTimeline, editorialHash } from '../src/compile.js';
import { agent, human, sampleTimeline } from './fixtures.js';

const FPS = { num: 30, den: 1 };

/** Projeto Lyrics: música 20 s (trecho 10–20 s), três linhas, composição em V1. */
function lyricsTimeline(): TimelineDocument {
  const doc = createTimeline({ projectId: 'p1', revisionId: 'r1', width: 1080, height: 1920, loudnessProfile: 'none' });
  doc.assets.song = { assetId: 'song', hash: 'd'.repeat(64), kind: 'audio', sourceTimebase: { num: 44100, den: 1 }, durationUnits: 44100 * 20, hasAudio: true };
  doc.tracks.find((t) => t.id === 'A1')!.items.push(
    parseItem({ id: 'song-clip', kind: 'clip', assetId: 'song', sourceIn: 44100 * 10, sourceOut: 44100 * 20, timelineStart: 0, duration: 300 }),
  );
  doc.tracks.find((t) => t.id === 'V1')!.items.push(
    parseItem({ id: 'lyrics-fx', kind: 'composition', templateId: 'reactive-lyrics', templateVersion: 1, params: { preset: 'neon' }, timelineStart: 0, duration: 300 }),
  );
  const { items } = lyricItemsFromImport(
    [
      { text: 'antes do trecho', stanza: 0, startMs: 2000, endMs: 4000, status: 'SUGGESTED', source: 'import', words: [] },
      {
        text: 'A luz chegou',
        stanza: 0,
        startMs: 10_500,
        endMs: 12_000,
        status: 'SUGGESTED',
        source: 'import',
        words: [
          { text: 'A', startMs: 10_500, endMs: 10_800, confidence: null },
          { text: 'luz', startMs: 10_800, endMs: 11_300, confidence: null },
          { text: 'chegou', startMs: 11_300, endMs: 12_000, confidence: 0.4 },
        ],
      },
      { text: 'no meio da noite', stanza: 1, startMs: 12_000, endMs: 15_000, status: 'SUGGESTED', source: 'import', words: [] },
      { text: 'cruza o fim', stanza: 1, startMs: 19_000, endMs: 21_000, status: 'SUGGESTED', source: 'import', words: [] },
    ],
    { fps: FPS, segmentStartMs: 10_000, segmentFrames: 300 },
  );
  doc.tracks.push({ id: 'L1', type: 'caption', role: 'lyrics', name: 'Letra', order: 4, muted: false, locked: false, items });
  doc.video.durationFrames = 300;
  return parseTimeline(doc);
}

const patch = (doc: TimelineDocument, operations: TimelineOperation[], origin = human) =>
  applyPatch(doc, { expectedRevisionId: doc.revisionId, operations, origin: { userId: null, agentRunId: null, command: null, planSummary: null, restoredFromRevisionId: null, ...origin } }, { newRevisionId: `r-${Math.random()}` });

describe('conversão ms ↔ frames', () => {
  it('arredonda uma vez e não acumula drift', () => {
    assert.equal(msToFrames(1000, FPS), 30);
    assert.equal(msToFrames(1016, FPS), 30);
    assert.equal(msToFrames(1017, FPS), 31);
    const ntsc = { num: 30000, den: 1001 };
    // Frame → ms → frame é identidade, inclusive em 29,97 fps e em 3 h.
    for (const f of [0, 1, 29, 30, 1799, 323_676]) assert.equal(msToFrames(framesToMs(f, ntsc), ntsc), f);
    // ms → frame → ms fica a menos de meio frame.
    for (let ms = 0; ms < 60_000; ms += 137) assert.ok(Math.abs(framesToMs(msToFrames(ms, ntsc), ntsc) - ms) <= 1001 / 30000 / 2 * 1000 + 0.5);
  });
});

describe('letra na timeline', () => {
  it('importa só o trecho, converte para frames e mantém palavras', () => {
    const doc = lyricsTimeline();
    assert.deepEqual(validateSemantics(doc), []);
    const lines = lyricLines(doc);
    assert.deepEqual(lines.map((l) => l.text), ['A luz chegou', 'no meio da noite', 'cruza o fim']);
    assert.equal(lines[0]!.timelineStart, 15);
    assert.deepEqual(lines[0]!.words.map((w) => [w.start, w.end]), [[15, 24], [24, 39], [39, 60]]);
    assert.equal(lines[0]!.words[2]!.confidence, 0.4);
    // Linha cortada no fim do trecho perde o excedente.
    assert.equal(lines[2]!.timelineStart + lines[2]!.duration, 300);
  });

  it('TXT sem tempo vira rascunho UNALIGNED, que bloqueia o final', () => {
    const { items } = lyricItemsFromImport(
      [
        { text: 'um', stanza: 0, startMs: null, endMs: null, status: 'UNALIGNED', source: 'import', words: [] },
        { text: 'dois', stanza: 0, startMs: null, endMs: null, status: 'UNALIGNED', source: 'import', words: [] },
      ],
      { fps: FPS, segmentStartMs: 0, segmentFrames: 300 },
    );
    assert.deepEqual(items.map((i) => [i.timelineStart, i.duration, i.lyric!.status]), [[0, 150, 'UNALIGNED'], [150, 150, 'UNALIGNED']]);
  });

  it('editar o tempo de uma palavra cria revisão sem mexer no áudio', () => {
    const doc = lyricsTimeline();
    const line = lyricLines(doc)[0]!;
    const words = line.words.map((w) => ({ ...w }));
    words[1]!.start = 26;
    const result = patch(doc, [{ op: 'setLyricLine', itemId: line.id, words }]);
    assert.ok(result.ok, JSON.stringify(!result.ok && result.error));
    if (!result.ok) return;
    assert.equal(lyricLines(result.document)[0]!.words[1]!.start, 26);
    assert.deepEqual(result.document.tracks.find((t) => t.id === 'A1'), doc.tracks.find((t) => t.id === 'A1'));
    assert.notEqual(editorialHash(result.document), editorialHash(doc));
  });

  it('rejeita palavra fora da linha e palavras fora de ordem', () => {
    const doc = lyricsTimeline();
    const line = lyricLines(doc)[0]!;
    const outside = patch(doc, [{ op: 'setLyricLine', itemId: line.id, words: [{ text: 'A', start: 0, end: 20 }] }]);
    assert.equal(!outside.ok && outside.error.code, 'INVALID');
    const disordered = patch(doc, [{ op: 'setLyricLine', itemId: line.id, words: [{ text: 'b', start: 30, end: 40 }, { text: 'a', start: 16, end: 20 }] }]);
    assert.equal(!disordered.ok && disordered.error.code, 'INVALID');
  });

  it('validar bloqueia; agente não valida nem altera linha validada', () => {
    const doc = lyricsTimeline();
    const line = lyricLines(doc)[0]!;
    const validated = patch(doc, [{ op: 'validateLyrics', itemIds: [line.id], validated: true }]);
    assert.ok(validated.ok);
    if (!validated.ok) return;
    const v = lyricLines(validated.document)[0]!;
    assert.equal(v.lyric!.status, 'VALIDATED');
    assert.equal(v.locked, true);

    const byAgent = patch(validated.document, [{ op: 'setLyricLine', itemId: line.id, text: 'outra letra' }], agent);
    assert.equal(!byAgent.ok && byAgent.error.code, 'LOCKED');
    const agentValidates = patch(doc, [{ op: 'validateLyrics', itemIds: [line.id], validated: true }], agent);
    assert.equal(!agentValidates.ok && agentValidates.error.code, 'FORBIDDEN');
    const offset = patch(validated.document, [{ op: 'shiftLyrics', trackId: 'L1', frames: 3 }]);
    assert.equal(!offset.ok && offset.error.code, 'LOCKED');

    // Pessoa desvalida e edita no mesmo patch.
    const reopened = patch(validated.document, [
      { op: 'validateLyrics', itemIds: [line.id], validated: false },
      { op: 'setLyricLine', itemId: line.id, text: 'A luz voltou' },
    ]);
    assert.ok(reopened.ok);
    if (!reopened.ok) return;
    const r = lyricLines(reopened.document)[0]!;
    assert.equal(r.lyric!.status, 'SUGGESTED');
    assert.equal(r.locked, false);
    assert.deepEqual(r.words, [], 'texto novo sem palavras reenviadas descarta os tempos antigos');
  });

  it('linha sem tempo não pode ser validada; ajuste de tempo a promove a SUGGESTED', () => {
    const doc = lyricsTimeline();
    const line = lyricLines(doc)[1]!;
    const unaligned = patch(doc, [{ op: 'setLyricLine', itemId: line.id, status: 'UNALIGNED' }]);
    assert.ok(unaligned.ok);
    if (!unaligned.ok) return;
    assert.equal(lyricIssuesInTimeline(unaligned.document).find((i) => i.itemId === line.id)?.code, 'UNALIGNED');
    const refused = patch(unaligned.document, [{ op: 'validateLyrics', itemIds: [line.id], validated: true }]);
    assert.equal(!refused.ok && refused.error.code, 'INVALID');
    const synced = patch(unaligned.document, [{ op: 'setLyricLine', itemId: line.id, timelineStart: 62 }]);
    assert.ok(synced.ok && lyricLines(synced.document)[1]!.lyric!.status === 'SUGGESTED');
  });

  it('offset global desloca linhas e palavras juntas', () => {
    const doc = lyricsTimeline();
    const result = patch(doc, [{ op: 'shiftLyrics', trackId: 'L1', frames: -6 }]);
    assert.ok(result.ok);
    if (!result.ok) return;
    const first = lyricLines(result.document)[0]!;
    assert.equal(first.timelineStart, 9);
    assert.deepEqual(first.words.map((w) => w.start), [9, 18, 33]);
    const tooFar = patch(doc, [{ op: 'shiftLyrics', trackId: 'L1', frames: -16 }]);
    assert.equal(!tooFar.ok && tooFar.error.code, 'INVALID');
  });

  it('moveClip leva as palavras da legenda junto', () => {
    const doc = lyricsTimeline();
    const line = lyricLines(doc)[0]!;
    const result = patch(doc, [{ op: 'moveClip', itemId: line.id, timelineStart: 100 }]);
    assert.ok(result.ok, JSON.stringify(!result.ok && result.error));
    if (result.ok) assert.deepEqual(lyricLines(result.document).find((l) => l.id === line.id)!.words.map((w) => w.start), [100, 109, 124]);
  });

  it('updateCompositionParams mescla parâmetros', () => {
    const doc = lyricsTimeline();
    const result = patch(doc, [{ op: 'updateCompositionParams', itemId: 'lyrics-fx', params: { intensity: 40 } }]);
    assert.ok(result.ok);
    if (!result.ok) return;
    const item = result.document.tracks.find((t) => t.id === 'V1')!.items[0]!;
    assert.deepEqual(item.kind === 'composition' && item.params, { preset: 'neon', intensity: 40 });
    // `null` remove a chave (asset de cena retirado).
    const added = patch(result.document, [{ op: 'updateCompositionParams', itemId: 'lyrics-fx', params: { '$file:assets/scenes/a.jpg': 'asset1' } }]);
    assert.ok(added.ok);
    if (!added.ok) return;
    const removed = patch(added.document, [{ op: 'updateCompositionParams', itemId: 'lyrics-fx', params: { '$file:assets/scenes/a.jpg': null } }]);
    assert.ok(removed.ok);
    if (!removed.ok) return;
    const after = removed.document.tracks.find((t) => t.id === 'V1')!.items[0]!;
    assert.deepEqual(after.kind === 'composition' && after.params, { preset: 'neon', intensity: 40 });
  });

  it('linhas de letra sobrepostas são permitidas; estado de letra fora da trilha não', () => {
    const doc = lyricsTimeline();
    const overlap = patch(doc, [{ op: 'setLyricLine', itemId: lyricLines(doc)[1]!.id, timelineStart: 50 }]);
    assert.ok(overlap.ok, 'canto sobreposto');
    const wrong = structuredClone(doc);
    (wrong.tracks.find((t) => t.id === 'C1')!.items as CaptionItem[]).push(
      parseItem({ id: 'x', kind: 'caption', text: 'x', timelineStart: 0, duration: 10, lyric: { status: 'SUGGESTED', source: 'manual' } }) as CaptionItem,
    );
    assert.ok(validateSemantics(wrong).some((i) => i.code === 'LYRIC_META'));
  });

  it('QA aponta confiança baixa, sobreposição e linha além do áudio', () => {
    const doc = lyricsTimeline();
    const codes = lyricIssuesInTimeline(doc).map((i) => i.code);
    assert.ok(codes.includes('LOW_CONFIDENCE'));
    assert.ok(codes.includes('NOT_VALIDATED'));
    assert.ok(!codes.includes('BEYOND_AUDIO'));
  });

  it('documento sem campos de letra mantém o hash editorial', () => {
    const doc = sampleTimeline();
    assert.equal(editorialHash(parseTimeline(JSON.parse(JSON.stringify(doc)))), editorialHash(doc));
  });
});

describe('compilação da letra e do trecho', () => {
  it('letra vai para a composição, não para o ASS', () => {
    const plan = compileTimeline(lyricsTimeline(), { quality: 'final' });
    assert.equal(plan.text.length, 0);
    assert.deepEqual(plan.lyrics.map((l) => l.text), ['A luz chegou', 'no meio da noite', 'cruza o fim']);
    assert.deepEqual(plan.lyrics[0]!.words!.map((w) => w.startFrame), [15, 24, 39]);
    assert.equal(plan.lyrics[1]!.words, null, 'modo linha');
    assert.equal(plan.output.loudnessProfile, 'none');
  });

  it('trecho recorta áudio, composição e letra com tempos relativos', () => {
    const doc = lyricsTimeline();
    const full = compileTimeline(doc, { quality: 'preview' });
    const plan = compileTimeline(doc, { quality: 'preview', range: { startFrame: 30, endFrame: 120 } });
    assert.equal(plan.durationFrames, 90);
    assert.equal(plan.durationSec, 3);
    assert.notEqual(plan.planHash, full.planHash);
    const audio = plan.audio[0]!;
    assert.equal(audio.startSec, 0);
    assert.equal(audio.sourceInSec, 11, 'música começa 10 s + 1 s cortado');
    assert.equal(audio.sourceOutSec, 14);
    const comp = plan.video[0]!;
    assert.equal(comp.compositionInSec, 1);
    assert.equal(comp.compositionDurationSec, 10);
    assert.equal(comp.endSec, 3);
    // "A luz chegou" (15–60) corta no início: palavras fora do trecho saem, as demais ficam relativas.
    assert.deepEqual(plan.lyrics[0], { itemId: plan.lyrics[0]!.itemId, text: 'A luz chegou', startFrame: 0, endFrame: 30, status: 'SUGGESTED', words: [{ text: 'luz', startFrame: 0, endFrame: 9 }, { text: 'chegou', startFrame: 9, endFrame: 30 }] });
    assert.throws(() => compileTimeline(doc, { quality: 'preview', range: { startFrame: 300, endFrame: 310 } }), /Trecho inválido/);
  });
});
