import React from 'react';
import { useCurrentFrame } from 'remotion';
import type { CaptionSegment } from '@editor-video/core/render';
import { shadow, theme } from '../theme';

const MAX_LINES = 2;
const MAX_CHARS_PER_LINE = 22;

function wrapText(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > MAX_CHARS_PER_LINE && current) {
      lines.push(current);
      current = word;
      if (lines.length >= MAX_LINES) break;
    } else {
      current = next;
    }
  }

  if (current && lines.length < MAX_LINES) lines.push(current);

  // Se ainda couber conteúdo e já lotamos as linhas, trunca a última
  if (lines.length === MAX_LINES) {
    const used = lines.join(' ').length;
    if (used < text.length && lines[MAX_LINES - 1]) {
      const last = lines[MAX_LINES - 1]!;
      lines[MAX_LINES - 1] = last.length > 3 ? `${last.slice(0, Math.max(3, last.length - 1))}…` : last;
    }
  }

  return lines;
}

export const Captions: React.FC<{
  captions: CaptionSegment[];
  /** Empurra para cima quando há label de contexto no clipe. */
  raised?: boolean;
}> = ({ captions, raised = false }) => {
  const frame = useCurrentFrame();

  const active =
    captions.find((caption) => frame >= caption.startFrame && frame < caption.endFrame) ??
    captions.find((caption) => frame >= caption.startFrame && frame <= caption.endFrame);

  if (!active) return null;

  const words = active.words;
  const highlightIndex =
    words?.findIndex((word) => frame >= word.startFrame && frame < Math.max(word.endFrame, word.startFrame + 1)) ??
    -1;

  return (
    <div
      style={{
        position: 'absolute',
        left: 48,
        right: 48,
        bottom: raised ? 400 : 320,
        textAlign: 'center',
        fontFamily: theme.body,
        fontWeight: 800,
        fontSize: 48,
        lineHeight: 1.2,
        color: theme.text,
        textShadow: shadow.text,
        pointerEvents: 'none',
      }}
    >
      {words && words.length > 0 ? (
        <CaptionWords words={words} highlightIndex={highlightIndex} />
      ) : (
        wrapText(active.text).map((line) => (
          <div key={line} style={lineStyle}>
            {line}
          </div>
        ))
      )}
    </div>
  );
};

const lineStyle: React.CSSProperties = {
  display: 'inline-block',
  background: 'rgba(0,0,0,0.55)',
  borderRadius: 14,
  padding: '8px 18px',
  marginBottom: 6,
};

const CaptionWords: React.FC<{
  words: NonNullable<CaptionSegment['words']>;
  highlightIndex: number;
}> = ({ words, highlightIndex }) => {
  // Agrupa em até 2 linhas ~22 chars com a palavra atual perto do centro visual
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

  const visible: typeof words = [];
  let chars = 0;
  for (let i = windowStart; i < words.length; i++) {
    const next = chars + words[i]!.text.length + (visible.length ? 1 : 0);
    if (visible.length > 0 && next > MAX_CHARS_PER_LINE * MAX_LINES) break;
    visible.push(words[i]!);
    chars = next;
  }

  // Quebra visual em linhas
  const lines: Array<typeof words> = [[]];
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

  return (
    <>
      {lines.map((line, lineIndex) => (
        <div key={lineIndex} style={lineStyle}>
          {line.map((word, wordIndex) => {
            const globalIndex = windowStart + lines.slice(0, lineIndex).reduce((n, l) => n + l.length, 0) + wordIndex;
            const active = globalIndex === highlightIndex;
            return (
              <span
                key={`${word.startFrame}-${word.text}-${wordIndex}`}
                style={{
                  color: active ? theme.accent : theme.text,
                  marginRight: 10,
                }}
              >
                {word.text}
              </span>
            );
          })}
        </div>
      ))}
    </>
  );
};
