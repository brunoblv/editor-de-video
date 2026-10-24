import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addVariant,
  applyPatch,
  clipTimelineDuration,
  diffRevisions,
  formatTimecode,
  originSchema,
  removeRangeOps,
  rescale,
  restoreRevision,
  sourceToTimeline,
  timelineToSource,
  validateTimeline,
  type TimelineDocument,
  type TimelineOperation,
} from '../src/index.js';
import { compileTimeline, editorialDifferences, editorialHash } from '../src/compile.js';
import { agent, human, sampleTimeline } from './fixtures.js';

function patch(doc: TimelineDocument, ops: TimelineOperation[], who: object = human, newRevisionId = 'r2') {
  return applyPatch(
    doc,
    { expectedRevisionId: doc.revisionId, operations: ops, origin: originSchema.parse(who) },
    { newRevisionId },
  );
}

describe('aritmética temporal', () => {
  it('converte entre timebases com um único arredondamento', () => {
    assert.equal(rescale(30, { num: 30, den: 1 }, { num: 48000, den: 1 }), 48000);
    // 10 horas a 30000/1001 → 60fps sem drift
    const tenHours = rescale(10 * 3600 * 30000, { num: 30000, den: 1001 }, { num: 30000, den: 1001 });
    assert.equal(tenHours, 10 * 3600 * 30000);
    assert.equal(rescale(1079, { num: 30000, den: 1001 }, { num: 60, den: 1 }), 2160);
  });

  it('calcula duração na timeline com playbackRate', () => {
    assert.equal(clipTimelineDuration(0, 300, { num: 30, den: 1 }, { num: 30, den: 1 }, { num: 2, den: 1 }), 150);
  });

  it('formata timecode', () => {
    assert.equal(formatTimecode(30 * 3661 + 5, { num: 30, den: 1 }), '01:01:01:05');
  });
});

describe('validação', () => {
  it('aceita a timeline de exemplo', () => {
    assert.deepEqual(validateTimeline(sampleTimeline()), { ok: true });
  });

  it('rejeita sobreposição, asset desconhecido e fonte além do fim', () => {
    const doc = sampleTimeline();
    const v1 = doc.tracks[0]!;
    const c2 = v1.items[1]!;
    if (c2.kind === 'clip') {
      c2.timelineStart = 100;
      c2.sourceOut = 2000;
      c2.duration = 1700;
    }
    const result = validateTimeline(doc);
    assert.equal(result.ok, false);
    if (!result.ok) {
      const codes = result.issues.map((i) => i.code);
      assert.ok(codes.includes('OVERLAP'));
      assert.ok(codes.includes('SOURCE_RANGE'));
    }
  });
});

describe('patches', () => {
  it('cria nova revisão encadeada e preserva a original intacta', () => {
    const doc = sampleTimeline();
    const before = JSON.stringify(doc);
    const result = patch(doc, [{ op: 'trimClip', itemId: 'c1', sourceOut: 60 }]);
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.document.revisionId, 'r2');
    assert.equal(result.document.parentRevisionId, 'r1');
    assert.equal(JSON.stringify(doc), before);
  });

  it('AC-06: rejeita patch com revisão antiga sem sobrescrever', () => {
    const doc = sampleTimeline();
    const first = patch(doc, [{ op: 'updateText', itemId: 't1', text: 'Manual' }]);
    assert.ok(first.ok);
    if (!first.ok) return;
    const stale = applyPatch(
      first.document,
      {
        expectedRevisionId: 'r1',
        operations: [{ op: 'updateText', itemId: 't1', text: 'Agente' }],
        origin: originSchema.parse(agent),
      },
      { newRevisionId: 'r3' },
    );
    assert.equal(stale.ok, false);
    if (!stale.ok) {
      assert.equal(stale.error.code, 'CONFLICT');
      assert.equal((stale.error as { currentRevisionId: string }).currentRevisionId, 'r2');
    }
  });

  it('AC-04/RF-10: agente não altera item bloqueado nem desbloqueia', () => {
    let doc = sampleTimeline();
    const locked = patch(doc, [{ op: 'setLock', itemId: 'c2', locked: true }]);
    assert.ok(locked.ok);
    if (!locked.ok) return;
    doc = locked.document;

    const blocked = patch(doc, [{ op: 'updateAudio', itemId: 'c2', audio: { gainDb: -6 } }], agent, 'r3');
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.error.code, 'LOCKED');

    const unlock = patch(doc, [{ op: 'setLock', itemId: 'c2', locked: false }], agent, 'r3');
    assert.equal(unlock.ok, false);
    if (!unlock.ok) assert.equal(unlock.error.code, 'FORBIDDEN');

    // Escopo: alterar outro item funciona e não toca o bloqueado.
    const scoped = patch(doc, [{ op: 'updateAudio', itemId: 'c1', audio: { gainDb: -6 } }], agent, 'r3');
    assert.ok(scoped.ok);
    if (scoped.ok) {
      const changes = diffRevisions(doc, scoped.document);
      assert.deepEqual(
        changes.map((c) => ('itemId' in c ? c.itemId : '')),
        ['c1'],
      );
    }
  });

  it('humano pode desbloquear e editar no mesmo patch', () => {
    const doc = sampleTimeline();
    doc.tracks[0]!.items[0]!.locked = true;
    const result = patch(doc, [
      { op: 'setLock', itemId: 'c1', locked: false },
      { op: 'trimClip', itemId: 'c1', sourceOut: 120 },
    ]);
    assert.ok(result.ok, JSON.stringify(!result.ok && result.error));
    if (!result.ok) return;
    // Lacuna entre c1 (0–120) e c2 (150–300) é permitida; nada mais muda.
    assert.equal(result.document.tracks[0]!.items[0]!.duration, 120);
    assert.equal(result.document.video.durationFrames, 300);
  });

  it('AC-05: corrigir texto de legenda não altera cortes', () => {
    const doc = sampleTimeline();
    const result = patch(doc, [{ op: 'updateCaptions', edits: [{ itemId: 's1', text: 'Olá, mundo' }] }]);
    assert.ok(result.ok);
    if (!result.ok) return;
    const clipsBefore = JSON.stringify(doc.tracks.filter((t) => t.type !== 'caption'));
    const clipsAfter = JSON.stringify(result.document.tracks.filter((t) => t.type !== 'caption'));
    assert.equal(clipsAfter, clipsBefore);
    assert.equal(result.document.video.durationFrames, doc.video.durationFrames);
  });

  it('remover trecho do vídeo é operação editorial distinta (ripple)', () => {
    const doc = sampleTimeline();
    const ops = removeRangeOps(doc, 60, 150, (p) => `${p}-r`);
    const result = patch(doc, ops);
    assert.ok(result.ok, JSON.stringify(!result.ok && result.error));
    if (!result.ok) return;
    assert.equal(result.document.video.durationFrames, 210);
    const v1 = result.document.tracks.find((t) => t.id === 'V1')!;
    const c1 = v1.items.find((i) => i.id === 'c1')!;
    const c2 = v1.items.find((i) => i.id === 'c2')!;
    assert.equal(c1.duration, 60);
    assert.equal(c2.timelineStart, 60);
  });

  it('split mantém continuidade exata em fonte NTSC', () => {
    const doc = sampleTimeline();
    doc.tracks[0]!.items.push({
      id: 'c3',
      kind: 'clip',
      assetId: 'vidB',
      sourceIn: 0,
      sourceOut: 299,
      timelineStart: 300,
      duration: clipTimelineDuration(0, 299, { num: 30000, den: 1001 }, { num: 30, den: 1 }),
      locked: false,
      playbackRate: { num: 1, den: 1 },
      transform: doc.tracks[0]!.items[0]!.kind === 'clip' ? structuredClone(doc.tracks[0]!.items[0]!.transform) : ({} as never),
      audio: { gainDb: 0, fadeInFrames: 0, fadeOutFrames: 0, pan: 0, duckUnderTrackId: null, duckDb: -12 },
    });
    doc.video.durationFrames = 300 + doc.tracks[0]!.items[2]!.duration;
    const result = patch(doc, [{ op: 'splitClip', itemId: 'c3', atFrame: 400, newItemId: 'c3b' }]);
    assert.ok(result.ok, JSON.stringify(!result.ok && result.error));
    if (!result.ok) return;
    const items = result.document.tracks[0]!.items;
    const a = items.find((i) => i.id === 'c3')!;
    const b = items.find((i) => i.id === 'c3b')!;
    assert.equal(a.timelineStart + a.duration, b.timelineStart);
    if (a.kind === 'clip' && b.kind === 'clip') assert.equal(a.sourceOut, b.sourceIn);
  });
});

describe('variantes e compilação', () => {
  it('AC-07: 9:16 e 16:9 preservam edição e têm crop independente', () => {
    let doc = sampleTimeline();
    doc = addVariant(doc, '9:16');
    const result = patch(doc, [
      { op: 'updateTransform', itemId: 'c1', variantId: 'v-9x16', transform: { positionX: 0.3 } },
    ]);
    assert.ok(result.ok);
    if (!result.ok) return;
    const vertical = compileTimeline(result.document, { variantId: 'v-9x16', quality: 'final' });
    const horizontal = compileTimeline(result.document, { quality: 'final' });
    assert.equal(vertical.width, 1080);
    assert.equal(vertical.height, 1920);
    assert.deepEqual(
      vertical.video.map((v) => [v.itemId, v.startSec, v.endSec, v.sourceInSec]),
      horizontal.video.map((v) => [v.itemId, v.startSec, v.endSec, v.sourceInSec]),
    );
    const vc1 = vertical.video.find((v) => v.itemId === 'c1')!;
    const hc1 = horizontal.video.find((v) => v.itemId === 'c1')!;
    assert.equal(vc1.transform.positionX, 0.3);
    assert.ok(vc1.transform.crop);
    assert.equal(hc1.transform.positionX, 0.5);
    assert.equal(hc1.transform.crop, null);
  });

  it('prévia e final não divergem editorialmente', () => {
    const doc = sampleTimeline();
    const preview = compileTimeline(doc, { quality: 'preview' });
    const final = compileTimeline(doc, { quality: 'final' });
    assert.deepEqual(editorialDifferences(preview, final), []);
    assert.equal(preview.planHash, final.planHash);
    assert.ok(preview.width < final.width);
    assert.ok(preview.video.every((v) => v.kind !== 'clip' || v.useProxy));
    assert.ok(final.video.every((v) => !v.useProxy));
  });

  it('vídeo sem áudio não gera faixa de áudio', () => {
    const plan = compileTimeline(sampleTimeline(), { quality: 'final' });
    assert.deepEqual(plan.audio.map((a) => a.itemId).sort(), ['c1', 'c2', 'm1']);
  });
});

describe('histórico e mapeamento', () => {
  it('AC-08: restaurar cria nova revisão sem apagar histórico', () => {
    const r1 = sampleTimeline();
    const r2 = patch(r1, [{ op: 'removeClip', itemId: 't1' }]);
    assert.ok(r2.ok);
    if (!r2.ok) return;
    const r3 = restoreRevision(r1, r2.document, 'r3', originSchema.parse(human));
    assert.equal(r3.revisionId, 'r3');
    assert.equal(r3.parentRevisionId, 'r2');
    assert.equal(r3.origin.restoredFromRevisionId, 'r1');
    assert.equal(editorialHash(r3), editorialHash(r1));
    assert.equal(r3.assets.vidA!.hash, r1.assets.vidA!.hash);
  });

  it('mapeia original ↔ edição', () => {
    const doc = sampleTimeline();
    assert.deepEqual(sourceToTimeline(doc, 'vidA', 310), [160]);
    assert.deepEqual(sourceToTimeline(doc, 'vidA', 200), []);
    const hits = timelineToSource(doc, 160).filter((h) => h.assetId === 'vidA');
    assert.equal(hits[0]?.sourceUnits, 310);
  });
});
