import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { shadow, theme } from '../theme';

export const Intro: React.FC<{ title: string; clipCount: number }> = ({ title, clipCount }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 14, mass: 0.7 } });
  const exit = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scale = interpolate(enter, [0, 1], [0.7, 1]);

  // Sem isso títulos longos estouram a largura do quadro. A largura útil é
  // 1080 menos o padding lateral, e em Arial Black um caractere ocupa ~0.72em.
  const AVAILABLE_WIDTH = 880;
  const CHAR_RATIO = 0.72;
  const longestWord = title.split(/\s+/).reduce((max, word) => Math.max(max, word.length), 1);
  const fontSize = Math.min(118, AVAILABLE_WIDTH / (longestWord * CHAR_RATIO));

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 35%, #1c1330 0%, ${theme.bg} 70%)`,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: exit,
      }}
    >
      <div style={{ transform: `scale(${scale})`, textAlign: 'center', padding: '0 90px' }}>
        <div
          style={{
            fontFamily: theme.body,
            fontSize: 44,
            letterSpacing: 8,
            textTransform: 'uppercase',
            color: theme.accentSoft,
            marginBottom: 32,
            fontWeight: 700,
          }}
        >
          Top {clipCount}
        </div>
        <h1
          style={{
            fontFamily: theme.display,
            fontSize,
            lineHeight: 1.05,
            margin: 0,
            color: theme.text,
            textTransform: 'uppercase',
            textShadow: shadow.text,
            overflowWrap: 'break-word',
          }}
        >
          {title}
        </h1>
        <div
          style={{
            width: 220,
            height: 12,
            borderRadius: 999,
            background: theme.accent,
            margin: '48px auto 0',
            boxShadow: shadow.glow,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
