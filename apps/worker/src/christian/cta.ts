/** Biblioteca de CTAs (docs/Cristão/projeto.md §20) — usada só quando o Gemini não gerar uma. */
const CTA_LIBRARY = [
  'Se essa mensagem tocou seu coração, deixe seu like, inscreva-se no canal e compartilhe com alguém que precisa ouvir isso agora.',
  'Se essa palavra fez sentido para você, se inscreva, deixe o like e mande esse vídeo para quem precisa ouvir hoje.',
  'Inscreva-se para receber uma mensagem como essa todos os dias, deixe seu like e envie para alguém que precisa.',
  'Deixe seu like, siga o canal e compartilhe com alguém que está precisando dessa palavra agora.',
];

export function pickFallbackCta(): string {
  return CTA_LIBRARY[Math.floor(Math.random() * CTA_LIBRARY.length)]!;
}
