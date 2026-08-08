import React from 'react';
import { AbsoluteFill, OffthreadVideo, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { RenderClip } from '@editor-video/core/render';
import { Captions } from './Captions';
import { shadow, theme } from '../theme';

/** Duração do fade de entrada/saída de cada clipe, em frames. */
const FADE = 8;

export const ClipSegment: React.FC<{ clip: RenderClip }> = ({ clip }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const hasCaptions = Boolean(clip.captions?.length);

  const opacity = interpolate(
    frame,
    [0, FADE, durationInFrames - FADE, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, opacity }}>
      {clip.src ? (
        <OffthreadVideo
          src={clip.src}
          // Os clipes já saem normalizados do worker em 1080x1920.
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        // Sem src apenas no Remotion Studio, onde não há worker servindo assets.
        <AbsoluteFill
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            color: theme.textMuted,
            fontFamily: theme.body,
            fontSize: 40,
          }}
        >
          preview do clipe
        </AbsoluteFill>
      )}

      {/* Badge do ranking fica visível durante todo o clipe */}
      <div
        style={{
          position: 'absolute',
          top: 90,
          left: 60,
          fontFamily: theme.display,
          fontSize: 92,
          color: theme.text,
          padding: '6px 34px',
          borderRadius: 24,
          background: theme.accent,
          boxShadow: shadow.hard,
        }}
      >
        #{clip.rank}
      </div>

      {hasCaptions ? <Captions captions={clip.captions!} raised={Boolean(clip.label)} /> : null}

      {clip.label ? (
        <div
          style={{
            position: 'absolute',
            left: 60,
            right: 60,
            bottom: hasCaptions ? 180 : 220,
            textAlign: 'center',
            fontFamily: theme.body,
            fontWeight: 700,
            fontSize: 52,
            lineHeight: 1.25,
            color: theme.text,
            textShadow: shadow.text,
            background: 'rgba(0,0,0,0.42)',
            borderRadius: 20,
            padding: '22px 28px',
          }}
        >
          {clip.label}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
