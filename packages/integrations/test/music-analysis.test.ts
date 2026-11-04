/**
 * Análise musical com áudio sintético gerado pelo FFmpeg: bumbo a 120 BPM
 * (graves) e chimbal nos contratempos (agudos) — tempos e bandas conhecidos.
 */
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { before, describe, it } from 'node:test';
import { analyzeMusic, analyzeSamples, runProcess } from '../src/index.js';

const KICK = 'sin(2*PI*55*t)*exp(-18*mod(t,0.5))';
const HAT = '0.4*sin(2*PI*7000*t)*sin(2*PI*9100*t)*exp(-60*mod(t+0.25,0.5))';

describe('análise musical', () => {
  let dir: string;
  let file: string;

  before(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ev-music-'));
    file = path.join(dir, 'beat.wav');
    await runProcess('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc=exprs='0.7*${KICK}+${HAT}':s=44100:d=12`, '-y', file]);
  });

  it('estima 120 BPM, batidas a cada 500 ms e separa graves de agudos', async () => {
    const map = await analyzeMusic(file, { audioHash: 'sha256:test-beat-120', workDir: dir });
    assert.equal(map.durationMs, 12_000);
    assert.ok(map.bpmEstimate !== null && Math.abs(map.bpmEstimate - 120) < 2.5, `bpm ${map.bpmEstimate}`);
    assert.ok(map.beatTimesMs.length >= 20, `batidas: ${map.beatTimesMs.length}`);
    const gaps = map.beatTimesMs.slice(1).map((t, i) => t - map.beatTimesMs[i]!);
    assert.ok(gaps.every((g) => Math.abs(g - 500) <= 40), `intervalos ${gaps.join(',')}`);
    // Batidas no bumbo (múltiplos de 500 ms), não no chimbal.
    assert.ok(map.beatTimesMs.every((t) => Math.min(t % 500, 500 - (t % 500)) <= 40), map.beatTimesMs.join(','));

    const at = (series: number[], ms: number) => series[Math.round(ms / map.features.sampleIntervalMs)]!;
    assert.ok(at(map.features.bass, 4000) > at(map.features.bass, 4250) + 0.3, 'grave forte no bumbo');
    assert.ok(at(map.features.treble, 4250) > at(map.features.treble, 4100) + 0.3, 'agudo forte no chimbal');
    for (const key of ['rms', 'bass', 'mids', 'treble'] as const) {
      assert.equal(map.features[key].length, 600);
      assert.ok(map.features[key].every((v) => v >= 0 && v <= 1 && Number.isFinite(v)));
    }
    // Onsets incluem bumbo e chimbal (transientes, não só batidas).
    assert.ok(map.onsets.some((o) => Math.abs((o.timeMs % 500) - 250) <= 40));
  });

  it('é determinística', async () => {
    const a = await analyzeMusic(file, { audioHash: 'sha256:test-beat-120', workDir: dir });
    const b = await analyzeMusic(file, { audioHash: 'sha256:test-beat-120', workDir: dir });
    assert.deepEqual(a, b);
  });

  it('silêncio: BPM desconhecido, sem batidas e sem NaN', () => {
    const map = analyzeSamples(new Float32Array(22_050 * 5), 22_050, { audioHash: 'sha256:silence-0000' });
    assert.equal(map.bpmEstimate, null);
    assert.deepEqual(map.beatTimesMs, []);
    assert.deepEqual(map.onsets, []);
    assert.ok(map.features.rms.every((v) => v === 0));
  });
});
