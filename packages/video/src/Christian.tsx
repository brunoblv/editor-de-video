import React from 'react';
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, useCurrentFrame } from 'remotion';
import type { ChristianProps } from '@editor-video/core/render';
import { Captions } from './components/Captions';
import { Watermark } from './components/Watermark';
import { shadow, theme } from './theme';

const VERSE_CARD_FRAMES = 110;

const VerseCard: React.FC<{ reference: string; text: string }> = ({ reference, text }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10, VERSE_CARD_FRAMES - 20, VERSE_CARD_FRAMES], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity, pointerEvents: 'none' }}>
      <div
        style={{
          margin: '0 56px',
          textAlign: 'center',
          fontFamily: theme.body,
          color: theme.text,
          background: 'rgba(0,0,0,0.45)',
          borderRadius: 24,
          padding: '32px 28px',
        }}
      >
        <div style={{ fontSize: 46, lineHeight: 1.3, fontStyle: 'italic', textShadow: shadow.text }}>
          &ldquo;{text}&rdquo;
        </div>
        <div style={{ marginTop: 18, fontSize: 30, fontWeight: 700, color: theme.accentSoft }}>
          {reference}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const CtaOverlay: React.FC<{ text: string; from: number; total: number }> = ({ text, from, total }) => {
  const frame = useCurrentFrame();
  const local = frame - from;
  const opacity = interpolate(local, [0, 10, Math.max(11, total - 15), total], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 260, opacity, pointerEvents: 'none' }}>
      <div
        style={{
          margin: '0 48px',
          textAlign: 'center',
          fontFamily: theme.display,
          fontSize: 42,
          lineHeight: 1.25,
          color: theme.text,
          textShadow: shadow.text,
          background: 'rgba(0,0,0,0.5)',
          borderRadius: 18,
          padding: '18px 24px',
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

export const Christian: React.FC<ChristianProps> = ({
  watermark,
  verse,
  ctaText,
  voiceoverUrl,
  musicUrl,
  musicVolume,
  scenes,
  captions,
  captionStyle,
}) => {
  const total = Math.max(
    1,
    scenes.reduce((acc, scene) => acc + scene.durationInFrames, 0),
  );

  const ctaFrames = Math.min(120, total);
  const ctaFrom = Math.max(0, total - ctaFrames);

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
                  style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }}
                  muted
                />
              ) : null}
              <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.55))' }} />
            </AbsoluteFill>
          </Sequence>
        );
      })}

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

      {verse ? (
        <Sequence from={0} durationInFrames={Math.min(VERSE_CARD_FRAMES, total)}>
          <VerseCard reference={verse.reference} text={verse.text} />
        </Sequence>
      ) : null}

      {ctaText ? <CtaOverlay text={ctaText} from={ctaFrom} total={total} /> : null}

      {captions.length > 0 ? <Captions captions={captions} captionStyle={captionStyle} background="dark" /> : null}

      {watermark ? <Watermark text={watermark} /> : null}
    </AbsoluteFill>
  );
};
