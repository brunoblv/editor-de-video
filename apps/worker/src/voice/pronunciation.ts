import { BIBLE_BOOK_NAMES } from '../christian/bible-seed.js';

const ONES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
  'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const HUNDREDS = ['', 'cem', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

/**
 * Número por extenso em PT-BR — suficiente para capítulo/versículo (Salmos 119
 * é o teto prático deste conteúdo). Acima de 199 cai de volta para o dígito
 * (degradação aceitável, não é o caso comum).
 */
export function numberToWordsPt(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 199) return String(n);
  if (n < 20) return ONES[n]!;
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return ones === 0 ? TENS[tens]! : `${TENS[tens]} e ${ONES[ones]}`;
  }
  if (n === 100) return 'cem';
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return rest === 0 ? HUNDREDS[hundreds]! : `${HUNDREDS[hundreds]} e ${numberToWordsPt(rest)}`;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "6-7" (dentro de uma referência já capturada) → "seis a sete". */
function verseToSpoken(verse: string): string {
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(verse.trim());
  if (range) return `${numberToWordsPt(Number(range[1]))} a ${numberToWordsPt(Number(range[2]))}`;
  const n = Number(verse.trim());
  return Number.isFinite(n) ? numberToWordsPt(n) : verse;
}

const bookPattern = new RegExp(
  `\\b(${BIBLE_BOOK_NAMES.map(escapeRegex).join('|')})\\s+(\\d+)\\s*:\\s*(\\d+(?:\\s*-\\s*\\d+)?)\\b`,
  'g',
);

/**
 * "Salmos 23:1" → "Salmos, capítulo vinte e três, versículo um".
 * "Jo 3:16" não é coberto (a biblioteca local usa nomes por extenso, ex.
 * "João" — ver BIBLE_BOOK_NAMES), evitando leitura mecânica tipo "dois pontos".
 */
export function verbalizeBibleReferences(text: string): string {
  return text.replace(bookPattern, (_match, book: string, chapter: string, verse: string) => {
    const chapterWords = numberToWordsPt(Number(chapter));
    const verseWords = verseToSpoken(verse);
    return `${book}, capítulo ${chapterWords}, versículo ${verseWords}`;
  });
}

/**
 * Prepara texto para TTS (docs/Cristão/projeto.md §15-18): referências
 * bíblicas viram fala por extenso, e faixas numéricas soltas ("6-7") viram
 * "seis a sete" em vez de soarem como subtração pro espeak-ng/Piper.
 */
export function prepareTextForSpeech(text: string): string {
  let out = verbalizeBibleReferences(text);
  out = out.replace(/(\d)\s*-\s*(\d)/g, '$1 a $2');
  return out;
}
