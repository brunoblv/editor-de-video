/**
 * Chaves de cache de etapas de processamento (§11): hash do asset,
 * parâmetros, modelo, revisão e versão do pipeline. Mudar só o título de um
 * projeto não muda a chave da transcrição (AC-09).
 */
import { hashObject } from './hashing.js';

export const PIPELINE_VERSIONS = {
  inspect: 'inspect-v1',
  proxy: 'proxy-v1',
  transcribe: 'transcribe-v1',
  scenes: 'scenes-v1',
  frames: 'frames-v1',
  render: 'render-v1',
  validate: 'validate-v1',
} as const;

export type ProcessingStep = keyof typeof PIPELINE_VERSIONS;

export type CacheKeyInput = {
  step: ProcessingStep;
  /** sha256 do original (etapas por asset). */
  assetHash?: string;
  /** Hash editorial/plano (etapas por revisão). */
  planHash?: string;
  params?: Record<string, unknown>;
  model?: string | null;
};

export function stepCacheKey(input: CacheKeyInput): string {
  return `${input.step}_${hashObject({
    pipeline: PIPELINE_VERSIONS[input.step],
    assetHash: input.assetHash ?? null,
    planHash: input.planHash ?? null,
    params: input.params ?? {},
    model: input.model ?? null,
  }).slice(0, 40)}`;
}
