import React from 'react';
import { interpolate } from 'remotion';
import type { CharacterState } from '@editor-video/core/render';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpState(start: CharacterState, end: CharacterState, t: number): CharacterState {
  return {
    colorLevel: lerp(start.colorLevel, end.colorLevel, t),
    lightLevel: lerp(start.lightLevel, end.lightLevel, t),
    detailLevel: lerp(start.detailLevel, end.detailLevel, t),
    emotion: t < 0.5 ? start.emotion : end.emotion,
    pose: t < 0.5 ? start.pose : end.pose,
    environment: t < 0.5 ? start.environment : end.environment,
    particles: start.particles || end.particles,
  };
}

/**
 * Silhueta humana abstrata que evolui de cinza/apagada para colorida/iluminada
 * conforme a mensagem avança — a metáfora central do canal (ver docs/Cristão/projeto.md §13).
 */
export const CharacterScene: React.FC<{
  start: CharacterState;
  end: CharacterState;
  /** 0..1 — posição no vídeo. */
  progress: number;
}> = ({ start, end, progress }) => {
  const state = lerpState(start, end, Math.max(0, Math.min(1, progress)));

  const saturation = interpolate(state.colorLevel, [0, 1], [0, 100]);
  const brightness = interpolate(state.lightLevel, [0, 1], [55, 105]);
  const glowOpacity = interpolate(state.lightLevel, [0, 1], [0, 0.55]);
  const glowSize = interpolate(state.detailLevel, [0, 1], [60, 220]);
  const warmHue = interpolate(state.lightLevel, [0, 1], [210, 35]);

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: '18%',
        transform: 'translateX(-50%)',
        width: 220,
        height: 340,
        filter: `saturate(${saturation}%) brightness(${brightness}%)`,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '35%',
          transform: 'translate(-50%, -50%)',
          width: glowSize,
          height: glowSize,
          borderRadius: '50%',
          background: `radial-gradient(circle, hsla(${warmHue}, 90%, 70%, ${glowOpacity}) 0%, transparent 70%)`,
        }}
      />
      <svg viewBox="0 0 220 340" width="220" height="340">
        <ellipse cx="110" cy="60" rx="38" ry="44" fill={`hsl(${warmHue}, 25%, ${20 + state.colorLevel * 25}%)`} />
        <path
          d={
            state.pose === 'kneeling'
              ? 'M60 300 C60 220 80 150 110 150 C140 150 160 220 160 300 Z'
              : state.pose === 'sitting'
                ? 'M55 300 C55 210 75 130 110 130 C145 130 165 210 165 300 Z'
                : 'M65 310 C58 220 75 110 110 110 C145 110 162 220 155 310 Z'
          }
          fill={`hsl(${warmHue}, 30%, ${18 + state.colorLevel * 22}%)`}
        />
      </svg>
    </div>
  );
};
