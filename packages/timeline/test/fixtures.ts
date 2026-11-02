import { createTimeline, parseItem, type TimelineDocument } from '../src/index.js';

/** Timeline 30fps com dois clipes de vídeo (fonte 30fps), música, título e legendas. */
export function sampleTimeline(): TimelineDocument {
  const doc = createTimeline({ projectId: 'p1', revisionId: 'r1', width: 1920, height: 1080 });
  doc.assets = {
    vidA: {
      assetId: 'vidA',
      hash: 'a'.repeat(64),
      kind: 'video',
      sourceTimebase: { num: 30, den: 1 },
      durationUnits: 900,
      width: 1920,
      height: 1080,
      hasAudio: true,
    },
    vidB: {
      assetId: 'vidB',
      hash: 'b'.repeat(64),
      kind: 'video',
      sourceTimebase: { num: 30000, den: 1001 },
      durationUnits: 600,
      width: 3840,
      height: 2160,
      hasAudio: false,
    },
    music: {
      assetId: 'music',
      hash: 'c'.repeat(64),
      kind: 'audio',
      sourceTimebase: { num: 48000, den: 1 },
      durationUnits: 48000 * 60,
      hasAudio: true,
    },
  };
  const v1 = doc.tracks.find((t) => t.id === 'V1')!;
  v1.items.push(
    parseItem({ id: 'c1', kind: 'clip', assetId: 'vidA', sourceIn: 0, sourceOut: 150, timelineStart: 0, duration: 150 }),
    parseItem({ id: 'c2', kind: 'clip', assetId: 'vidA', sourceIn: 300, sourceOut: 450, timelineStart: 150, duration: 150 }),
  );
  doc.tracks
    .find((t) => t.id === 'A1')!
    .items.push(
      parseItem({ id: 'm1', kind: 'clip', assetId: 'music', sourceIn: 0, sourceOut: 48000 * 10, timelineStart: 0, duration: 300 }),
    );
  doc.tracks
    .find((t) => t.id === 'T1')!
    .items.push(parseItem({ id: 't1', kind: 'text', text: 'Título', timelineStart: 0, duration: 60 }));
  doc.tracks
    .find((t) => t.id === 'C1')!
    .items.push(
      parseItem({ id: 's1', kind: 'caption', text: 'Ola mundo', timelineStart: 0, duration: 90 }),
      parseItem({ id: 's2', kind: 'caption', text: 'segunda frase', timelineStart: 150, duration: 90 }),
    );
  doc.video.durationFrames = 300;
  return doc;
}

export const human = { author: 'human' as const, userId: 'u1' };
export const agent = { author: 'agent' as const, agentRunId: 'run1', command: 'teste' };
