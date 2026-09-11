import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, useCurrentFrame } from 'remotion';
import type { RabiscoProps, RabiscoScene } from '@editor-video/core/render';
import { Captions } from './components/Captions';

/** Paper/off-white palette (RABISCO.md §12) — deliberadamente separada do
 * `theme.ts` escuro/bold dos outros pipelines; Rabisco é claro e introspectivo. */
const paper = {
  bg: '#f4efe4',
  ink: '#242018',
  inkSoft: 'rgba(36,32,24,0.62)',
  body: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

const CHARACTER_SIZE = 620;

const POSITION_STYLE: Record<RabiscoScene['position'], React.CSSProperties> = {
  center: { justifyContent: 'center', alignItems: 'center' },
  left: { justifyContent: 'flex-start', alignItems: 'center', paddingLeft: 40 },
  right: { justifyContent: 'flex-end', alignItems: 'center', paddingRight: 40 },
  bottom: { justifyContent: 'center', alignItems: 'flex-end', paddingBottom: 260 },
};

/** Pequenas oscilações imperfeitas, nunca cinematográficas (RABISCO.md §11). */
function animationStyle(animation: RabiscoScene['animation'], local: number, total: number): React.CSSProperties {
  const inFrames = Math.min(15, Math.floor(total / 3));
  const outFrames = Math.min(15, Math.floor(total / 3));

  const opacity = interpolate(
    local,
    [0, inFrames, Math.max(inFrames + 1, total - outFrames), total],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Leve flutuação vertical contínua em todas as animações — reforça a
  // sensação de "desenho que ganhou vida" mesmo depois da entrada.
  const float = Math.sin(local / 18) * 6;

  switch (animation) {
    case 'slide-left': {
      const x = interpolate(local, [0, inFrames], [-80, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return { opacity, transform: `translate(${x}px, ${float}px)` };
    }
    case 'slide-right': {
      const x = interpolate(local, [0, inFrames], [80, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return { opacity, transform: `translate(${x}px, ${float}px)` };
    }
    case 'rise': {
      const y = interpolate(local, [0, inFrames], [60, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return { opacity, transform: `translateY(${y + float}px)` };
    }
    case 'float':
      return { opacity, transform: `translateY(${float}px)` };
    case 'zoom': {
      const scale = interpolate(local, [0, inFrames], [0.85, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return { opacity, transform: `scale(${scale}) translateY(${float}px)` };
    }
    case 'fade':
    default:
      return { opacity, transform: `translateY(${float}px)` };
  }
}

const ThoughtBubble: React.FC<{ text: string; position: RabiscoScene['position'] }> = ({ text, position }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const align = position === 'left' ? 'flex-start' : position === 'right' ? 'flex-end' : 'center';

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: align, paddingTop: 220, pointerEvents: 'none' }}>
      <div
        style={{
          opacity,
          margin: '0 56px',
          maxWidth: 620,
          textAlign: 'center',
          fontFamily: paper.body,
          fontStyle: 'italic',
          fontSize: 40,
          color: paper.ink,
          background: 'rgba(255,255,255,0.72)',
          border: `2px solid ${paper.ink}`,
          borderRadius: 28,
          padding: '18px 26px',
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

const CharacterScene: React.FC<{ scene: RabiscoScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const style = animationStyle(scene.animation, frame, scene.durationInFrames);

  return (
    <AbsoluteFill style={POSITION_STYLE[scene.position]}>
      <div style={{ width: CHARACTER_SIZE, ...style }}>
        <Img src={scene.assetUrl} style={{ width: '100%', height: 'auto', display: 'block' }} />
      </div>
      {scene.thought ? <ThoughtBubble text={scene.thought} position={scene.position} /> : null}
    </AbsoluteFill>
  );
};

const RabiscoWatermark: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      position: 'absolute',
      bottom: 70,
      width: '100%',
      textAlign: 'center',
      fontFamily: paper.body,
      fontSize: 30,
      fontWeight: 600,
      letterSpacing: 2,
      color: paper.inkSoft,
      pointerEvents: 'none',
    }}
  >
    {text}
  </div>
);

export const Rabisco: React.FC<RabiscoProps> = ({ watermark, voiceoverUrl, musicUrl, musicVolume, scenes, captions }) => {
  const total = Math.max(1, ...scenes.map((scene) => scene.startFrame + scene.durationInFrames));

  return (
    <AbsoluteFill style={{ backgroundColor: paper.bg }}>
      {scenes.map((scene, index) => (
        <Sequence key={index} from={scene.startFrame} durationInFrames={scene.durationInFrames}>
          <CharacterScene scene={scene} />
        </Sequence>
      ))}

      {voiceoverUrl ? <Audio src={voiceoverUrl} /> : null}

      {musicUrl ? (
        <Audio
          src={musicUrl}
          loop
          volume={(frame) =>
            musicVolume *
            interpolate(frame, [0, 30, Math.max(31, total - 45), total], [0, 1, 1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          }
        />
      ) : null}

      {captions.length > 0 ? <Captions captions={captions} /> : null}

      {watermark ? <RabiscoWatermark text={watermark} /> : null}
    </AbsoluteFill>
  );
};
