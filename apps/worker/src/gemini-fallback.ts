import { logger } from './logger.js';

const log = logger('gemini-fallback');

/** Monta a cadeia de modelos a tentar, na ordem, sem duplicatas. */
export function buildModelChain(primary: string, fallbacks: string[]): string[] {
  const seen = new Set<string>();
  const chain: string[] = [];
  for (const raw of [primary, ...fallbacks]) {
    const model = raw.trim();
    if (model && !seen.has(model)) {
      seen.add(model);
      chain.push(model);
    }
  }
  return chain;
}

/**
 * Executa `attempt` para cada modelo da cadeia, na ordem, avançando para o
 * próximo em qualquer falha — cada modelo Gemini tem cota diária própria,
 * então um 429 num modelo não significa que os outros também estejam sem cota.
 * Propaga o erro do último modelo tentado se todos falharem.
 */
export async function withGeminiModelFallback<T>(
  models: string[],
  attempt: (model: string) => Promise<T>,
): Promise<T> {
  if (models.length === 0) {
    throw new Error('Nenhum modelo Gemini configurado.');
  }

  let lastErr: unknown;
  for (let i = 0; i < models.length; i++) {
    const model = models[i]!;
    try {
      return await attempt(model);
    } catch (err) {
      lastErr = err;
      if (i === models.length - 1) break;
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`modelo ${model} falhou (${message}) — tentando próximo: ${models[i + 1]}`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
