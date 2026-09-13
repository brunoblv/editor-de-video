import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import {
  COUNTDOWN_DURATION_FRAMES,
  INTRO_DURATION_FRAMES,
  OUTRO_DURATION_FRAMES,
  type TopListProps,
} from '@editor-video/core/render';
import { ClipSegment } from './components/ClipSegment';
import { CountdownCard } from './components/CountdownCard';
import { Intro } from './components/Intro';
import { Outro } from './components/Outro';
import { Watermark } from './components/Watermark';
import { theme } from './theme';

export const TopList: React.FC<TopListProps> = ({ title, watermark, clips, captionStyle }) => {
  let cursor = INTRO_DURATION_FRAMES;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <Sequence durationInFrames={INTRO_DURATION_FRAMES}>
        <Intro title={title} clipCount={clips.length} />
      </Sequence>

      {clips.map((clip, index) => {
        const countdownFrom = cursor;
        const clipFrom = countdownFrom + COUNTDOWN_DURATION_FRAMES;
        cursor = clipFrom + clip.durationInFrames;

        return (
          <React.Fragment key={`${index}-${clip.src}`}>
            <Sequence from={countdownFrom} durationInFrames={COUNTDOWN_DURATION_FRAMES}>
              <CountdownCard rank={clip.rank} label={clip.label} />
            </Sequence>
            <Sequence from={clipFrom} durationInFrames={clip.durationInFrames}>
              <ClipSegment clip={clip} captionStyle={captionStyle} />
            </Sequence>
          </React.Fragment>
        );
      })}

      <Sequence from={cursor} durationInFrames={OUTRO_DURATION_FRAMES}>
        <Outro />
      </Sequence>

      {watermark ? <Watermark text={watermark} /> : null}
    </AbsoluteFill>
  );
};
