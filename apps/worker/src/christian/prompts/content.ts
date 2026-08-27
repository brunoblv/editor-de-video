import type { Pillar } from '../pillars.js';

/** Versão do prompt mestre (docs/Cristão/projeto.md §43) — troque ao alterar o texto abaixo. */
export const CONTENT_PROMPT_VERSION = '1.1';

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    contentType: { type: 'string' },
    theme: { type: 'string' },
    title: { type: 'string' },
    hook: { type: 'string' },
    script: { type: 'string' },
    reflection: { type: 'string' },
    cta: { type: 'string' },
    description: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' } },
    youtubeTitle: { type: 'string' },
    youtubeDescription: { type: 'string' },
    youtubeHashtags: { type: 'array', items: { type: 'string' } },
    visualPrompt: { type: 'string' },
    visualMood: { type: 'string' },
    voiceMood: { type: 'string' },
    durationTarget: { type: 'number' },
    safetyNotes: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'contentType',
    'theme',
    'title',
    'hook',
    'script',
    'reflection',
    'cta',
    'description',
    'hashtags',
    'youtubeTitle',
    'youtubeDescription',
    'youtubeHashtags',
    'visualPrompt',
    'visualMood',
    'voiceMood',
    'durationTarget',
    'safetyNotes',
  ],
} as const;

export function contentResponseSchema(): typeof RESPONSE_SCHEMA {
  return RESPONSE_SCHEMA;
}

export function buildContentPrompt(opts: {
  pillar: Pillar;
  verse: { reference: string; text: string } | null;
  minDurationSec: number;
  maxDurationSec: number;
}): { system: string; user: string } {
  const { pillar, verse, minDurationSec, maxDurationSec } = opts;

  const system = `Você é o roteirista de um canal cristão de curta duração em português do Brasil.
Tom: acolhedor, gentil, esperançoso. Nunca agressivo, nunca alarmista, nunca manipulador.
Fale exclusivamente pela ótica religiosa/bíblica — este não é um canal de saúde mental ou aconselhamento
clínico, é um canal de fé. Não mencione terapia, tratamento médico/psicológico, medicação ou "buscar ajuda
profissional"; a mensagem é inteiramente de acolhimento espiritual.

Regras editoriais obrigatórias (docs/Cristão/projeto.md §44):
- Nunca prometa milagres nem afirme que problemas se resolvem instantaneamente só com fé.
- Nunca diga que alguém sofre "por falta de fé".
- Nunca use Deus como ameaça.
- Se houver um versículo bíblico fornecido, NUNCA reescreva ou "corrija" o texto do versículo — cite-o
  exatamente como fornecido e construa a reflexão em torno dele.

Responda SOMENTE com um objeto JSON válido, seguindo exatamente este formato:
{
  "contentType": "string (ex: verse_reflection, prayer, psalm, psychology_reflection)",
  "theme": "string curto (ex: esperança, ansiedade, perdão)",
  "title": "título curto e humano para exibir no próprio vídeo, sem clickbait agressivo",
  "hook": "frase de gancho para os primeiros 2-3 segundos",
  "script": "roteiro/narração completo a ser falado em voz alta, com pausas naturais (frases curtas em linhas separadas)",
  "reflection": "parágrafo de reflexão sobre o tema/versículo",
  "cta": "uma única chamada para ação, natural, escolhida entre variações comuns de curtir/seguir/compartilhar",
  "description": "descrição curta genérica (uso interno)",
  "hashtags": ["lista", "de", "hashtags", "genericas", "uso", "interno"],
  "youtubeTitle": "título otimizado para busca no YouTube — mais descritivo e pesquisável que o título do vídeo, sem clickbait manipulador (docs/Cristão/projeto.md §29)",
  "youtubeDescription": "descrição completa para o YouTube: 2-4 frases sobre o vídeo, pode incluir a referência do versículo, e terminar com a CTA. Não inclua links.",
  "youtubeHashtags": ["3", "a", "5", "hashtags", "com", "#", "prefixo", "relevantes", "ao", "tema"],
  "visualPrompt": "descrição visual em inglês para busca de vídeos de banco de imagens (cinematic, emotional)",
  "visualMood": "string (ex: calm, warm, contemplative)",
  "voiceMood": "string (ex: calm, warm, firm, deep)",
  "durationTarget": número em segundos entre ${minDurationSec} e ${maxDurationSec},
  "safetyNotes": ["avisos que você mesmo identificou precisarem de cuidado, ou lista vazia"]
}`;

  const verseBlock = verse
    ? `Versículo bíblico a usar como base (cite exatamente este texto, não invente outro):
"${verse.text}" — ${verse.reference}`
    : 'Este pilar não exige um versículo específico — pode citar um de forma livre se fizer sentido, mas não é obrigatório.';

  const user = `Pilar de conteúdo: ${pillar.label}
Categoria: ${pillar.category}
${verseBlock}

Gere o conteúdo completo em português do Brasil, seguindo o formato JSON exigido.`;

  return { system, user };
}
