import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { shadow, theme } from '../theme';

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 50%, #1c1330 0%, ${theme.bg} 70%)`,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fadeIn,
        textAlign: 'center',
      }}
    >
      {/* A marca d'água persistente já aparece no rodapé; não repetimos aqui. */}
      <div
        style={{
          fontFamily: theme.display,
          fontSize: 96,
          color: theme.text,
          textTransform: 'uppercase',
          textShadow: shadow.text,
          padding: '0 90px',
        }}
      >
        Qual foi o seu favorito?
      </div>
    </AbsoluteFill>
  );
};
