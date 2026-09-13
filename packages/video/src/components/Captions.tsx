import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionSegment, CaptionStyle } from '@editor-video/core/render';
import { PATRICK_HAND_FONT_FAMILY, usePatrickHandFont } from '../fonts';

const MAX_LINES = 2;
/** ~40 chars por linha (recomendação: legendas legíveis, não apertadas). */
const MAX_CHARS_PER_LINE = 34;

/** Marca de marca-texto — mesma cor nos dois fundos (clara/escura), só ajusta opacidade. */
const MARK_COLOR = '#f2cf6b';

const FONT_CLEAN = '"Segoe UI", Roboto, Helvetica, Arial, sans-serif';
/** Patrick Hand real (servida localmente via public/fonts, ver fonts.ts) — com
 * fallback de sistema só pro raro caso de falha de carregamento. */
const FONT_HANDWRITTEN = `"${PATRICK_HAND_FONT_FAMILY}", "Segoe Script", "Bradley Hand", cursive`;

type Palette = { text: string; shadow: string };

function paletteFor(background: 'dark' | 'light'): Palette {
  return background === 'light'
    ? { text: '#242018', shadow: '0 1px 3px rgba(255,255,255,0.75)' }
    : { text: '#ffffff', shadow: '0 4px 24px rgba(0,0,0,0.85)' };
}

type Word = { text: string; startFrame: number; endFrame: number };

function wordsFromText(text: string): Word[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ({ text: w, startFrame: -1, endFrame: -1 }));
}

/** Janela de ~2 linhas ao redor da palavra ativa — nunca revela palavra por palavra. */
function windowLines(words: Word[], highlightIndex: number): Word[][] {
  const windowStart = (() => {
    if (highlightIndex < 0) return 0;
    let start = highlightIndex;
    let len = 0;
    while (start > 0 && len < MAX_CHARS_PER_LINE) {
      start -= 1;
      len += words[start]!.text.length + 1;
    }
    return start;
  })();

  const visible: Word[] = [];
  let chars = 0;
  for (let i = windowStart; i < words.length; i++) {
    const next = chars + words[i]!.text.length + (visible.length ? 1 : 0);
    if (visible.length > 0 && next > MAX_CHARS_PER_LINE * MAX_LINES) break;
    visible.push(words[i]!);
    chars = next;
  }

  const lines: Word[][] = [[]];
  let lineChars = 0;
  for (const word of visible) {
    const add = word.text.length + (lineChars ? 1 : 0);
    if (lineChars && lineChars + add > MAX_CHARS_PER_LINE && lines.length < MAX_LINES) {
      lines.push([word]);
      lineChars = word.text.length;
    } else if (lines.length <= MAX_LINES) {
      lines[lines.length - 1]!.push(word);
      lineChars += add;
    }
  }

  return lines;
}

const SpecialCard: React.FC<{ text: string; style: CaptionStyle }> = ({ text, style }) => (
  <div
    style={{
      display: 'inline-block',
      fontFamily: style === 'handwritten' ? FONT_HANDWRITTEN : FONT_CLEAN,
      fontWeight: style === 'handwritten' ? 400 : 700,
      fontSize: 52,
      lineHeight: 1.15,
      textAlign: 'center',
      color: '#ffffff',
      background: '#111111',
      padding: '20px 30px',
      borderRadius: 6,
      transform: 'rotate(-1deg)',
      maxWidth: 900,
    }}
  >
    {text}
  </div>
);

const StyledLine: React.FC<{
  words: Word[];
  style: CaptionStyle;
  palette: Palette;
  highlightIndex: number;
}> = ({ words, style, palette, highlightIndex }) => (
  <div
    style={{
      fontFamily: style === 'handwritten' ? FONT_HANDWRITTEN : FONT_CLEAN,
      fontWeight: style === 'handwritten' ? 400 : 600,
      fontSize: 48,
      lineHeight: 1.25,
      color: palette.text,
      textShadow: palette.shadow,
    }}
  >
    {words.map((word, index) => {
      const isActive = style === 'highlight' && word.startFrame >= 0 && index === highlightIndex;
      if (!isActive) {
        return <span key={`${word.text}-${index}`} style={{ marginRight: 12 }}>{word.text}</span>;
      }
      return (
        <span key={`${word.text}-${index}`} style={{ position: 'relative', marginRight: 12, display: 'inline-block' }}>
          <span
            style={{
              position: 'absolute',
              left: -4,
              right: -4,
              bottom: 4,
              height: '48%',
              background: MARK_COLOR,
              transform: 'rotate(-1deg)',
              zIndex: 0,
            }}
          />
          <span style={{ position: 'relative', zIndex: 1 }}>{word.text}</span>
        </span>
      );
    })}
  </div>
);

export const Captions: React.FC<{
  captions: CaptionSegment[];
  /** Empurra para cima quando há label de contexto no clipe. */
  raised?: boolean;
  captionStyle?: CaptionStyle;
  /** Fundo por trás da legenda: vídeo escuro (Christian/Curiosidade/TopList) ou papel claro (Rabisco). */
  background?: 'dark' | 'light';
}> = ({ captions, raised = false, captionStyle = 'minimal', background = 'dark' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  usePatrickHandFont(captionStyle === 'handwritten');

  const activeIndex = captions.findIndex(
    (caption) => frame >= caption.startFrame && frame < caption.endFrame,
  );
  const fallbackIndex =
    activeIndex >= 0
      ? activeIndex
      : captions.findIndex((caption) => frame >= caption.startFrame && frame <= caption.endFrame);

  if (fallbackIndex < 0) return null;
  const active = captions[fallbackIndex]!;
  const isLast = fallbackIndex === captions.length - 1;

  const words: Word[] = active.words && active.words.length > 0 ? active.words : wordsFromText(active.text);
  const highlightIndex = active.words
    ? words.findIndex((word) => frame >= word.startFrame && frame < Math.max(word.endFrame, word.startFrame + 1))
    : -1;

  const local = Math.max(0, frame - active.startFrame);
  const opacity = interpolate(local, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const rise = spring({ frame: local, fps, config: { damping: 200 } });

  const palette = paletteFor(background);
  // Legenda final: sempre um cartão de destaque, texto curto o bastante pra caber bem.
  const useSpecial = isLast && active.text.length <= 60;

  return (
    <div
      style={{
        position: 'absolute',
        left: 48,
        right: 48,
        bottom: raised ? 400 : 320,
        textAlign: 'center',
        pointerEvents: 'none',
        opacity,
        transform: `translateY(${(1 - rise) * 14}px)`,
      }}
    >
      {useSpecial
        ? <SpecialCard text={active.text} style={captionStyle} />
        : (() => {
            const lines = windowLines(words, highlightIndex);
            let offset = 0;
            return lines.map((line, index) => {
              const localHighlight = highlightIndex - offset;
              offset += line.length;
              return (
                <StyledLine
                  key={index}
                  words={line}
                  style={captionStyle}
                  palette={palette}
                  highlightIndex={localHighlight}
                />
              );
            });
          })()}
    </div>
  );
};
