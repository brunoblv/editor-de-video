/**
 * Preset Cinematic Atmospheric Lyrics (docs/v3/reactive-lyrics-cinematic.md).
 *
 * Tudo que decide O QUE aparece e QUANDO é calculado aqui, sem navegador:
 * - agrupamento da letra em fragmentos curtos (1–5 palavras), sem cruzar a
 *   linha nem quebrar no meio de uma oração quando dá para evitar;
 * - palavra de destaque (lista do usuário ou nota sustentada) em linha própria;
 * - planejamento de cenas: uma cena dura várias palavras/frases e só troca em
 *   mudança de frase, seção ou energia, nunca a cada palavra nem em grade fixa.
 *
 * O template só posiciona e anima o que vem pronto. Os tempos das palavras
 * nunca são alterados: o fragmento só agrupa palavras com os tempos validados.
 */
import { z } from 'zod';
import type { MusicalMap } from './lyrics.js';

export const LYRIC_DISPLAY_MODES = ['word', 'phrase', 'hybrid'] as const;
export const TEXT_TRANSITIONS = ['fade', 'scale', 'slide', 'blur'] as const;
export const SCENE_CHANGE_POLICIES = ['by_phrase', 'by_section', 'manual', 'ai_suggested'] as const;
export const BACKGROUND_MOTIONS = ['none', 'slow_zoom', 'pan', 'parallax_if_available'] as const;
/** Fundos procedurais (CSS, sem asset de terceiros) usados quando não há imagem. */
export const ATMOSPHERES = ['ocean', 'rose_moon', 'fog_city', 'cosmos', 'ember', 'storm'] as const;

export type LyricDisplayMode = (typeof LYRIC_DISPLAY_MODES)[number];
export type SceneChangePolicy = (typeof SCENE_CHANGE_POLICIES)[number];
export type Atmosphere = (typeof ATMOSPHERES)[number];

/** Pasta das imagens de cena dentro do projeto Hyperframes; cada uma vem de um `$file:` (asset). */
export const SCENE_FILE_PATTERN = /^assets\/scenes\/[A-Za-z0-9._-]{1,80}\.(?:jpe?g|png|webp)$/;

// ---------------------------------------------------------------------------
// Agrupamento da letra
// ---------------------------------------------------------------------------

export type TimedWord = { text: string; startMs: number; endMs: number };
export type GroupInputLine = { id: string; text: string; startMs: number; endMs: number; words: TimedWord[] | null };

export type CinematicWord = TimedWord & { emphasis: boolean };
export type CinematicGroup = {
  lineId: string;
  startMs: number;
  endMs: number;
  /** false: linha sem tempo por palavra; o fragmento aparece inteiro (sem interpolar palavras). */
  timed: boolean;
  words: CinematicWord[];
  /** Quantas palavras em cada linha visual (1–3 linhas). */
  rows: number[];
};

export type GroupOptions = {
  mode: LyricDisplayMode;
  maxWordsPerGroup: number;
  maxLines: number;
  emphasisWords: string[];
  autoEmphasis: boolean;
};

/** Pausa dentro da linha que separa fragmentos. */
const PHRASE_GAP_MS = 600;
/** No híbrido, oração com duração mediana de palavra acima disto aparece palavra a palavra. */
const HYBRID_SLOW_WORD_MS = 650;
/** Caracteres por linha visual antes de quebrar (o template ainda encolhe para caber). */
const ROW_CHARS = 14;
const CLAUSE_END = /[,.;:!?…—–)]$/u;

/** Forma comparável: minúsculas, sem acento e sem pontuação. */
export function normalizeWord(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'-]/gu, '');
}

/** "amor, luz; noite" → ['amor','luz','noite'] (vírgula, ponto e vírgula ou quebra de linha). */
export function parseEmphasisWords(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return [...new Set(value.split(/[,;\n]/).map((w) => normalizeWord(w.trim())).filter(Boolean))].slice(0, 100);
}

function balancedChunks<T>(items: T[], max: number): T[][] {
  if (items.length === 0) return [];
  const k = Math.ceil(items.length / max);
  const size = Math.floor(items.length / k);
  const extra = items.length % k;
  const out: T[][] = [];
  let i = 0;
  for (let c = 0; c < k; c += 1) {
    const n = size + (c < extra ? 1 : 0);
    out.push(items.slice(i, i + n));
    i += n;
  }
  return out;
}

/** Linhas visuais: a palavra de destaque fica sozinha; o resto equilibra por caracteres. */
function layoutRows(words: CinematicWord[], maxLines: number): number[] {
  const n = words.length;
  if (n === 0) return [];
  if (maxLines <= 1 || n === 1) return [n];
  const e = words.findIndex((w) => w.emphasis);
  if (e >= 0 && n > 1) {
    const rows = [e, 1, n - e - 1].filter((r) => r > 0);
    while (rows.length > maxLines) {
      // Junta a parte de depois à linha anterior para não perder ordem.
      const last = rows.pop()!;
      rows[rows.length - 1]! += last;
    }
    return rows;
  }
  const chars = words.reduce((s, w) => s + w.text.length, 0) + n - 1;
  const want = Math.min(maxLines, n, Math.max(1, Math.ceil(chars / ROW_CHARS)));
  if (want === 1) return [n];
  // Quebra gulosa pelo alvo de caracteres por linha.
  const target = chars / want;
  const rows: number[] = [];
  let count = 0;
  let acc = 0;
  words.forEach((w, i) => {
    const rowsAfterThis = want - rows.length - 1;
    const wordsLeft = n - i;
    // Abre linha nova quando a palavra passaria do alvo, ou para cada linha restante ter ao menos uma palavra.
    if (count > 0 && rowsAfterThis > 0 && (acc + 1 + w.text.length / 2 > target || wordsLeft <= rowsAfterThis)) {
      rows.push(count);
      count = 0;
      acc = 0;
    }
    acc += (count > 0 ? 1 : 0) + w.text.length;
    count += 1;
  });
  rows.push(count);
  return rows;
}

/**
 * Nota sustentada: a palavra mais longa da linha que dura bem mais que a
 * mediana. É um sinal de interpretação vocal, não de batida.
 */
function autoEmphasisIndex(words: TimedWord[]): number {
  if (words.length < 3) return -1;
  const durations = words.map((w) => w.endMs - w.startMs);
  const sorted = [...durations].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  let best = -1;
  durations.forEach((d, i) => {
    if (normalizeWord(words[i]!.text).length < 3) return;
    if (d >= Math.max(550, median * 1.8) && (best < 0 || d > durations[best]!)) best = i;
  });
  return best;
}

export function groupLyricWords(lines: GroupInputLine[], opts: GroupOptions): CinematicGroup[] {
  const max = Math.max(1, Math.min(8, Math.round(opts.maxWordsPerGroup)));
  const maxLines = Math.max(1, Math.min(3, Math.round(opts.maxLines)));
  const wanted = new Set(opts.emphasisWords.map(normalizeWord));
  const groups: CinematicGroup[] = [];
  const push = (line: GroupInputLine, words: CinematicWord[], timed: boolean) => {
    if (words.length === 0) return;
    groups.push({
      lineId: line.id,
      startMs: timed ? words[0]!.startMs : line.startMs,
      endMs: timed ? words[words.length - 1]!.endMs : line.endMs,
      timed,
      words,
      rows: layoutRows(words, maxLines),
    });
  };

  for (const line of lines) {
    if (!line.words || line.words.length === 0) {
      // Sem tempo por palavra: o fragmento é a linha inteira, no intervalo da linha.
      const words = line.text
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((text) => ({ text, startMs: line.startMs, endMs: line.endMs, emphasis: wanted.has(normalizeWord(text)) }));
      // No máximo um destaque por fragmento: o primeiro da lista.
      let seen = false;
      for (const w of words) {
        if (w.emphasis && seen) w.emphasis = false;
        if (w.emphasis) seen = true;
      }
      push(line, words, false);
      continue;
    }
    const auto = opts.autoEmphasis ? autoEmphasisIndex(line.words) : -1;
    const words: CinematicWord[] = line.words.map((w, i) => ({ ...w, emphasis: i === auto || wanted.has(normalizeWord(w.text)) }));

    if (opts.mode === 'word') {
      for (const w of words) push(line, [w], true);
      continue;
    }
    // Orações: pontuação no fim da palavra ou pausa longa entre palavras.
    const clauses: CinematicWord[][] = [[]];
    words.forEach((w, i) => {
      clauses[clauses.length - 1]!.push(w);
      const next = words[i + 1];
      if (next && (CLAUSE_END.test(w.text) || next.startMs - w.endMs > PHRASE_GAP_MS)) clauses.push([]);
    });
    for (const clause of clauses) {
      // Híbrido: canto lento (palavras longas) vai palavra a palavra; canto rápido, em frase.
      // Mediana: uma nota sustentada sozinha não transforma a oração inteira em palavra a palavra.
      const sorted = clause.map((w) => w.endMs - w.startMs).sort((a, b) => a - b);
      // Mediana inferior: em "virou luz" (rápida + sustentada) a oração continua em frase.
      const medianMs = sorted[Math.floor((sorted.length - 1) / 2)]!;
      if (opts.mode === 'hybrid' && clause.length > 1 && medianMs >= HYBRID_SLOW_WORD_MS) {
        for (const w of clause) push(line, [w], true);
        continue;
      }
      {
        for (const chunk of balancedChunks(clause, max)) {
          // Um destaque por fragmento: mantém o mais longo.
          const marked = chunk.filter((w) => w.emphasis);
          if (marked.length > 1) {
            const keep = marked.reduce((a, b) => (b.endMs - b.startMs > a.endMs - a.startMs ? b : a));
            chunk.forEach((w) => (w.emphasis = w === keep));
          }
          push(line, chunk, true);
        }
      }
    }
  }
  groups.sort((a, b) => a.startMs - b.startMs);
  return groups;
}

// ---------------------------------------------------------------------------
// Cenas
// ---------------------------------------------------------------------------

export const sceneEntrySchema = z
  .object({
    /** Caminho no projeto (assets/scenes/…); o asset vem do parâmetro `$file:<caminho>`. */
    file: z.string().regex(SCENE_FILE_PATTERN, 'use assets/scenes/<nome>.jpg|png|webp').optional(),
    atmosphere: z.enum(ATMOSPHERES).optional(),
    /** Só na política manual: início/fim em ms da MÚSICA (como as seções). */
    startMs: z.number().int().min(0).optional(),
    endMs: z.number().int().min(0).optional(),
    /** Nome exibido no estúdio (nome original do arquivo). */
    label: z.string().max(80).optional(),
  })
  .refine((s) => Boolean(s.file) !== Boolean(s.atmosphere), { message: 'cada cena tem uma imagem (file) ou uma atmosfera, não as duas' })
  .refine((s) => s.endMs === undefined || s.startMs === undefined || s.endMs > s.startMs, { message: 'endMs deve ser maior que startMs', path: ['endMs'] });

export type SceneEntry = z.infer<typeof sceneEntrySchema>;

export function parseScenesParam(value: unknown): SceneEntry[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  return z.array(sceneEntrySchema).max(24).parse(JSON.parse(value));
}

/** Sem cenas configuradas: atmosferas procedurais, na ordem. */
export const DEFAULT_SCENES: SceneEntry[] = (['ocean', 'rose_moon', 'fog_city', 'cosmos', 'ember'] as const).map((atmosphere) => ({ atmosphere }));

export type PlannedScene = {
  /** Índice da entrada em `scenes` (ou em DEFAULT_SCENES). */
  entry: number;
  /** ms relativos ao início da composição. */
  startMs: number;
  endMs: number;
  file: string | null;
  atmosphere: Atmosphere | null;
  seed: number;
};

export type PlanScenesInput = {
  entries: SceneEntry[];
  policy: SceneChangePolicy;
  groups: CinematicGroup[];
  /** Seções em ms da música. */
  sections: Array<{ startMs: number; endMs: number }>;
  songStartMs: number;
  durationMs: number;
  /** Duração mínima de uma cena (políticas automáticas). */
  minSceneMs: number;
  map: MusicalMap;
};

/** Corte um pouco antes da frase, sem invadir o fim da palavra anterior. */
function phraseCandidates(groups: CinematicGroup[]): number[] {
  const out: number[] = [];
  groups.forEach((g, i) => {
    const prev = groups[i - 1];
    const newLine = !prev || prev.lineId !== g.lineId;
    const pause = prev && g.startMs - prev.endMs > 1200;
    if (i > 0 && (newLine || pause)) out.push(Math.max(prev!.endMs, g.startMs - 250));
  });
  return out;
}

function meanOver(map: MusicalMap, series: 'rms' | 'bass', fromMs: number, toMs: number): number {
  const step = map.features.sampleIntervalMs;
  const s = map.features[series];
  const a = Math.max(0, Math.floor(fromMs / step));
  const b = Math.min(s.length, Math.ceil(toMs / step));
  if (b <= a) return 0;
  let sum = 0;
  for (let i = a; i < b; i += 1) sum += s[i]!;
  return sum / (b - a);
}

/** Cortes gulosos respeitando a duração mínima e sem deixar uma cena curta no fim. */
function greedyCuts(candidates: number[], durationMs: number, minSceneMs: number): number[] {
  const cuts: number[] = [];
  let last = 0;
  for (const c of [...candidates].sort((a, b) => a - b)) {
    if (c - last >= minSceneMs && durationMs - c >= minSceneMs * 0.5) {
      cuts.push(c);
      last = c;
    }
  }
  return cuts;
}

export function planScenes(input: PlanScenesInput): PlannedScene[] {
  const entries = input.entries.length > 0 ? input.entries : DEFAULT_SCENES;
  const dur = input.durationMs;
  if (dur <= 0) return [];
  const minScene = Math.max(1000, input.minSceneMs);
  const make = (entryIndex: number, startMs: number, endMs: number, i: number): PlannedScene => {
    const e = entries[entryIndex]!;
    return { entry: entryIndex, startMs: Math.round(startMs), endMs: Math.round(endMs), file: e.file ?? null, atmosphere: e.atmosphere ?? null, seed: 4099 + i * 131 + entryIndex };
  };
  const fromCuts = (cuts: number[]) => {
    const bounds = [0, ...cuts, dur];
    return bounds.slice(0, -1).map((s, i) => make(i % entries.length, s, bounds[i + 1]!, i));
  };

  if (input.policy === 'manual') {
    const manual = entries
      .map((e, entry) => ({ e, entry }))
      .filter(({ e }) => e.startMs !== undefined)
      .map(({ e, entry }) => ({ entry, start: e.startMs! - input.songStartMs, end: e.endMs !== undefined ? e.endMs - input.songStartMs : Infinity }))
      .sort((a, b) => a.start - b.start);
    const out: PlannedScene[] = [];
    manual.forEach((m, i) => {
      const next = manual[i + 1];
      const start = Math.max(0, m.start);
      const end = Math.min(dur, m.end, next ? next.start : Infinity);
      if (end > start) out.push(make(m.entry, start, end, i));
    });
    return out;
  }

  const sectionCuts = input.sections
    .flatMap((s) => [s.startMs - input.songStartMs, s.endMs - input.songStartMs])
    .filter((t) => t > 0 && t < dur);
  if (input.policy === 'by_section' && sectionCuts.length > 0) {
    // Seções são marcos do usuário: só descarta trechos menores que 1 s.
    return fromCuts(greedyCuts([...new Set(sectionCuts)], dur, 1000));
  }

  const phrases = phraseCandidates(input.groups);
  if (input.policy === 'ai_suggested') {
    // Sugestão automática pelo mapa musical (heurística determinística, sem LLM):
    // frases onde a energia muda mais viram corte; seções contam como mudança forte.
    const window = 2000;
    const score = (c: number) => {
      const t = c + input.songStartMs;
      const dr = Math.abs(meanOver(input.map, 'rms', t, t + window) - meanOver(input.map, 'rms', t - window, t));
      const db = Math.abs(meanOver(input.map, 'bass', t, t + window) - meanOver(input.map, 'bass', t - window, t));
      const atSection = sectionCuts.some((s) => Math.abs(s - c) < 600) ? 1 : 0;
      return dr + db + atSection;
    };
    const ranked = [...phrases, ...sectionCuts].map((c) => ({ c, s: score(c) })).sort((a, b) => b.s - a.s || a.c - b.c);
    const target = Math.max(0, Math.round(dur / Math.max(minScene * 1.4, 8000)) - 1);
    const cuts: number[] = [];
    for (const { c } of ranked) {
      if (cuts.length >= target) break;
      if (c < minScene || dur - c < minScene * 0.5) continue;
      if (cuts.some((x) => Math.abs(x - c) < minScene)) continue;
      cuts.push(c);
    }
    return fromCuts(cuts.sort((a, b) => a - b));
  }
  // by_phrase (e by_section sem seções): troca na mudança de frase, com cena mínima.
  return fromCuts(greedyCuts(phrases, dur, minScene));
}

/** Erros de configuração das cenas (para recusar o patch antes do render). */
export function cinematicParamIssues(params: Record<string, unknown>): string[] {
  const issues: string[] = [];
  let entries: SceneEntry[] = [];
  try {
    entries = parseScenesParam(params.scenes);
  } catch (err) {
    return [`cenas inválidas: ${err instanceof z.ZodError ? err.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ') : (err as Error).message}`];
  }
  for (const e of entries) {
    if (e.file && typeof params[`$file:${e.file}`] !== 'string') issues.push(`a cena ${e.file} não tem asset (parâmetro "$file:${e.file}")`);
  }
  if (params.sceneChangePolicy === 'manual' && entries.length > 0 && !entries.some((e) => e.startMs !== undefined)) {
    issues.push('a política manual precisa de pelo menos uma cena com startMs');
  }
  return issues;
}
