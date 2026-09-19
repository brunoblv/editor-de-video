export type TimedWord = { text: string; startFrame: number; endFrame: number };

/** Fixed pages keep a pause from rewinding the sentence or moving every word. */
export function captionPage(words: TimedWord[], frame: number, charsPerLine = 34) {
  const pages: { lines: TimedWord[][]; start: number }[] = [];
  let lines: TimedWord[][] = [[]];
  let start = 0;
  let chars = 0;
  words.forEach((word, index) => {
    const next = chars + (chars ? 1 : 0) + word.text.length;
    if (chars && next > charsPerLine) {
      if (lines.length === 2) {
        pages.push({ lines, start });
        lines = [[]];
        start = index;
      } else lines.push([]);
      chars = 0;
    }
    lines[lines.length - 1]!.push(word);
    chars += (chars ? 1 : 0) + word.text.length;
  });
  pages.push({ lines, start });
  let cursor = 0;
  words.forEach((word, index) => { if (word.startFrame <= frame) cursor = index; });
  const page = [...pages].reverse().find((item) => item.start <= cursor)!;
  return page.lines;
}
