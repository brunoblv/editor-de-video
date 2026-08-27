/**
 * Safety checker de regras editoriais (docs/Cristão/projeto.md §44).
 * Checagem baseada em regras — não substitui revisão humana, mas bloqueia os
 * casos mais óbvios antes de qualquer render/publicação. O conteúdo é falado
 * exclusivamente pela ótica religiosa (sem indicação de ajuda profissional),
 * mas nunca pode prometer cura literal pela fé nem desencorajar tratamento.
 */
export type SafetyResult = {
  passed: boolean;
  /** Frases banidas encontradas — motivo do bloqueio quando passed=false. */
  violations: string[];
};

const BANNED_PATTERNS: RegExp[] = [
  /ore\s+e\s+voc[eê]\s+ser[aá]\s+curad[oa]/i,
  /a\s+f[eé]\s+(vai\s+)?te\s+cura(r|rá)/i,
  /voc[eê]\s+est[aá]\s+sofrendo\s+porque\s+n[aã]o\s+tem\s+f[eé]/i,
  /pare\s+de\s+tomar\s+(o\s+)?rem[eé]dio/i,
  /n[aã]o\s+precisa\s+(de\s+)?m[eé]dico/i,
  /deus\s+vai\s+te\s+castigar/i,
  /deus\s+vai\s+te\s+abandonar/i,
];

export function checkSafety(fullText: string): SafetyResult {
  const violations = BANNED_PATTERNS.filter((pattern) => pattern.test(fullText)).map((pattern) =>
    pattern.source,
  );

  return {
    passed: violations.length === 0,
    violations,
  };
}
