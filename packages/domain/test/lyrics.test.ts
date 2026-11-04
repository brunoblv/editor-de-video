import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  detectLyricFormat,
  lyricIssues,
  musicalMapSchema,
  parseLyrics,
  resolveLyrics,
  sampleSeries,
  sliceForSegment,
  type MusicalMap,
} from '../src/index.js';

describe('importação de letra', () => {
  it('TXT preserva ordem, pontuação, Unicode e estrofes, sem inventar tempo', () => {
    const a = parseLyrics('A luz se acende,\nção e coração!\n\nSegunda estrofe', 'txt');
    assert.deepEqual(a.lines.map((l) => [l.text, l.stanza, l.status]), [
      ['A luz se acende,', 0, 'UNALIGNED'],
      ['ção e coração!', 0, 'UNALIGNED'],
      ['Segunda estrofe', 1, 'UNALIGNED'],
    ]);
    assert.ok(a.lines.every((l) => l.startMs === null && l.words.every((w) => w.startMs === null)));
    assert.equal(resolveLyrics(a).length, 0);
  });

  it('LRC: fim pela linha seguinte, refrão repetido vira ocorrências próprias e offset', () => {
    const lrc = '[ar:Teste]\n[offset:+200]\n[00:01.50]A luz se acende\n[00:04.00][00:10.00]Refrão aqui\n[00:07.25]\n[00:08.00]Verso dois';
    const a = parseLyrics(lrc, detectLyricFormat('x.lrc', lrc), { durationMs: 12_000 });
    assert.equal(a.offsetMs, -200);
    assert.deepEqual(a.lines.map((l) => [l.text, l.startMs, l.endMs]), [
      ['A luz se acende', 1500, 4000],
      ['Refrão aqui', 4000, 7250],
      ['Verso dois', 8000, 10_000],
      ['Refrão aqui', 10_000, 12_000],
    ]);
    assert.equal(new Set(a.lines.map((l) => l.id)).size, 4);
    // Sem marcação por palavra → modo linha (RF-012).
    assert.equal(resolveLyrics(a)[0]!.words, null);
    assert.equal(resolveLyrics(a)[0]!.startMs, 1300);
  });

  it('LRC estendido traz tempo por palavra; marcação parcial é descartada', () => {
    const a = parseLyrics('[00:01.00]<00:01.00>A <00:01.20>luz <00:01.80>acende\n[00:03.00]<00:03.00>só <00:03.40>metade sem', 'lrc', { durationMs: 5000 });
    assert.deepEqual(a.lines[0]!.words.map((w) => [w.text, w.startMs, w.endMs]), [
      ['A', 1000, 1200],
      ['luz', 1200, 1800],
      ['acende', 1800, 3000],
    ]);
    assert.ok(a.lines[1]!.words.every((w) => w.startMs === null));
    const resolved = resolveLyrics(a);
    assert.equal(resolved[0]!.words?.length, 3);
    assert.equal(resolved[1]!.words, null);
  });

  it('SRT e VTT, incluindo legenda com duas linhas e tempo por palavra no VTT', () => {
    const srt = '1\n00:00:01,000 --> 00:00:03,500\nPrimeira linha\ncontinua\n\n2\n00:00:04,000 --> 00:00:05,000\nSegunda';
    const s = parseLyrics(srt, detectLyricFormat('x.srt', srt));
    assert.deepEqual(s.lines.map((l) => [l.text, l.startMs, l.endMs]), [
      ['Primeira linha\ncontinua', 1000, 3500],
      ['Segunda', 4000, 5000],
    ]);
    const vtt = 'WEBVTT\n\n00:01.000 --> 00:02.000 align:center\nUma <00:01.400>duas <00:01.700>três\n\nnota\n00:00:03.000 --> 00:00:04.000\n<i>Sem palavras</i>';
    const v = parseLyrics(vtt, detectLyricFormat('legenda', vtt));
    assert.deepEqual(v.lines[0]!.words.map((w) => [w.text, w.startMs, w.endMs]), [
      ['Uma', 1000, 1400],
      ['duas', 1400, 1700],
      ['três', 1700, 2000],
    ]);
    assert.equal(v.lines[1]!.text, 'Sem palavras');
  });
});

describe('validação e offset', () => {
  it('offset global move tudo sem mudar durações relativas (RF-016)', () => {
    const a = parseLyrics('[00:01.00]<00:01.00>A <00:01.20>luz', 'lrc', { durationMs: 3000 });
    const shifted = resolveLyrics({ ...a, offsetMs: 200 });
    const base = resolveLyrics(a);
    assert.equal(shifted[0]!.startMs - base[0]!.startMs, 200);
    assert.deepEqual(
      shifted[0]!.words!.map((w) => w.endMs - w.startMs),
      base[0]!.words!.map((w) => w.endMs - w.startMs),
    );
  });

  it('aponta tempos inválidos e nada sai VALIDATED automaticamente (RF-015)', () => {
    const a = parseLyrics('[00:01.00]Um\n[00:04.00]Dois\nsem tempo', 'lrc', { durationMs: 5000 });
    const issues = lyricIssues({ ...a, offsetMs: -2000 }, 5000);
    assert.ok(issues.some((i) => i.code === 'NEGATIVE' && i.lineId === 'l1'));
    assert.ok(issues.some((i) => i.code === 'NOT_VALIDATED'));
    assert.ok(a.lines.every((l) => l.status !== 'VALIDATED'));
    const late = lyricIssues(a, 4500);
    assert.ok(late.some((i) => i.code === 'BEYOND_AUDIO' && i.lineId === 'l2'));
    const txt = parseLyrics('sem tempo', 'txt');
    assert.equal(lyricIssues(txt, 5000)[0]!.code, 'UNALIGNED');
  });
});

describe('mapa musical', () => {
  const map: MusicalMap = musicalMapSchema.parse({
    schemaVersion: 1,
    audioHash: 'sha256:0123456789abcdef',
    durationMs: 100,
    analysisVersion: 'test',
    bpmEstimate: null,
    beatTimesMs: [20, 60],
    onsets: [{ timeMs: 40, strength: 0.9 }],
    features: { sampleIntervalMs: 20, rms: [0, 0.5, 1, 0.5, 0], bass: [0, 0, 0, 0, 0], mids: [0, 0, 0, 0, 0], treble: [0, 0, 0, 0, 0] },
    sections: [{ id: 's1', type: 'verse', startMs: 0, endMs: 50, source: 'manual' }],
  });

  it('valida cardinalidade, ordem e seções', () => {
    assert.throws(() => musicalMapSchema.parse({ ...map, features: { ...map.features, rms: [0, 1] } }), /esperado/);
    assert.throws(() => musicalMapSchema.parse({ ...map, beatTimesMs: [60, 20] }), /crescentes/);
    assert.throws(() => musicalMapSchema.parse({ ...map, sections: [...map.sections, { id: 's2', type: 'chorus', startMs: 40, endMs: 90, source: 'manual' }] }), /sobrepostas/);
  });

  it('interpola a série no instante pedido', () => {
    assert.equal(sampleSeries(map.features.rms, 20, 30), 0.75);
    assert.equal(sampleSeries(map.features.rms, 20, 10_000), 0);
  });

  it('recorta trecho com tempos relativos', () => {
    const lines = [{ id: 'l1', text: 'x', startMs: 30, endMs: 90, words: null }];
    const seg = sliceForSegment(map, lines, 20, 60);
    assert.equal(seg.map.durationMs, 60);
    assert.deepEqual(seg.map.beatTimesMs, [0, 40]);
    assert.deepEqual(seg.map.onsets, [{ timeMs: 20, strength: 0.9 }]);
    assert.deepEqual(seg.map.features.rms, [0.5, 1, 0.5]);
    assert.deepEqual([seg.lines[0]!.startMs, seg.lines[0]!.endMs], [10, 60]);
    assert.deepEqual(seg.map.sections.map((s) => [s.startMs, s.endMs]), [[0, 30]]);
  });
});
