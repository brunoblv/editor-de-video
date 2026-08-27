/** Biblioteca de CTAs (docs/Cristão/projeto.md §20) — usada só quando o Gemini não gerar uma. */
const CTA_LIBRARY = [
  'Se essa mensagem falou com você, compartilhe com alguém.',
  'Se essa palavra fez sentido para você, deixe seu like.',
  'Se quiser receber uma mensagem como essa todos os dias, siga o perfil.',
  'Inscreva-se para acompanhar as próximas mensagens.',
  'Envie este vídeo para alguém que precisa ouvir isso hoje.',
];

export function pickFallbackCta(): string {
  return CTA_LIBRARY[Math.floor(Math.random() * CTA_LIBRARY.length)]!;
}
