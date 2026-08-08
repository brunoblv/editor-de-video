import React from 'react';
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, useCurrentFrame } from 'remotion';
import type { CuriosidadeProps } from '@editor-video/core/render';
import { Captions } from './components/Captions';
import { Watermark } from './components/Watermark';
import { shadow, theme } from './theme';

const HookOverlay: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8, 70, 90], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingTop: 160,
        opacity,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          margin: '0 48px',
          textAlign: 'center',
          fontFamily: theme.display,
          fontSize: 64,
          lineHeight: 1.15,
          color: theme.text,
          textShadow: shadow.text,
          background: 'rgba(0,0,0,0.45)',
          borderRadius: 20,
          padding: '22px 28px',
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

export const Curiosidade: React.FC<CuriosidadeProps> = ({
  watermark,
  hookText,
  voiceoverUrl,
  scenes,
  captions,
}) => {
  let cursor = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      {scenes.map((scene, index) => {
        const from = cursor;
        cursor += scene.durationInFrames;
        return (
          <Sequence key={`${index}-${scene.src}`} from={from} durationInFrames={scene.durationInFrames}>
            <AbsoluteFill>
              {scene.src ? (
                <OffthreadVideo
                  src={scene.src}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  muted
                />
              ) : (
                <AbsoluteFill
                  style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: theme.textMuted,
                    fontFamily: theme.body,
                    fontSize: 40,
                  }}
                >
                  cena {index + 1}
                </AbsoluteFill>
              )}
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {voiceoverUrl ? <Audio src={voiceoverUrl} /> : null}

      {hookText ? (
        <Sequence from={0} durationInFrames={Math.min(90, cursor || 90)}>
          <HookOverlay text={hookText} />
        </Sequence>
      ) : null}

      {captions.length > 0 ? <Captions captions={captions} /> : null}

      {watermark ? <Watermark text={watermark} /> : null}
    </AbsoluteFill>
  );
};
