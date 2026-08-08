import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { shadow, theme } from '../theme';

export const CountdownCard: React.FC<{ rank: number; label: string | null }> = ({
  rank,
  label,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const pop = spring({ frame, fps, config: { damping: 11, mass: 0.5, stiffness: 140 } });
  const scale = interpolate(pop, [0, 1], [0.3, 1]);
  const rotate = interpolate(pop, [0, 1], [-14, 0]);
  const fadeOut = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: theme.bg,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fadeOut,
      }}
    >
      <div
        style={{
          transform: `scale(${scale}) rotate(${rotate}deg)`,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: theme.display,
            fontSize: 340,
            lineHeight: 1,
            color: theme.text,
            textShadow: `0 0 90px ${theme.accent}`,
          }}
        >
          #{rank}
        </div>
        {label ? (
          <div
            style={{
              fontFamily: theme.body,
              fontSize: 46,
              fontWeight: 600,
              color: theme.textMuted,
              marginTop: 20,
              padding: '0 100px',
              textShadow: shadow.text,
            }}
          >
            {label}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
