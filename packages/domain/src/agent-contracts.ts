/**
 * Contratos internos das ferramentas do agente (§9). Nomes e entradas são
 * do hub — não APIs de fornecedor. O serviço apps/agent os expõe ao Claude
 * via Agent SDK; a API reutiliza os mesmos schemas para validação.
 */
import { z } from 'zod';
import { operationSchema } from '@editor-video/timeline';

const id = z.string().min(1).max(128);

export const agentToolInputs = {
  inspect_media: z.object({ assetId: id }),
  transcribe_media: z.object({
    assetId: id,
    language: z.string().min(2).max(16).optional(),
    model: z.string().max(64).optional(),
  }),
  detect_scenes: z.object({ assetId: id, threshold: z.number().min(0).max(1).default(0.3) }),
  extract_frames: z.object({
    assetId: id,
    timestampsSec: z.array(z.number().nonnegative()).min(1).max(12),
  }),
  create_edit_plan: z.object({
    projectId: id,
    briefing: z.string().min(1).max(8000),
    steps: z
      .array(z.object({ description: z.string().max(500), targets: z.array(id).default([]) }))
      .min(1)
      .max(30),
  }),
  apply_timeline_patch: z.object({
    projectId: id,
    expectedRevisionId: id,
    operations: z.array(operationSchema).min(1).max(200),
    summary: z.string().max(2000),
  }),
  generate_composition: z.object({
    templateVersionId: id,
    params: z.record(z.string(), z.unknown()),
  }),
  render_preview: z.object({ revisionId: id, variantId: id.optional() }),
  validate_output: z.object({ deliverableId: id }),
  render_final: z.object({ revisionId: id, variantId: id.optional() }),
  export_resolve_package: z.object({ revisionId: id, profile: z.enum(['edl', 'fcpxml']).default('edl') }),
  prepare_publication: z.object({ deliverableId: id, accountId: id }),
} as const;

export type AgentToolName = keyof typeof agentToolInputs;
export type AgentToolInput<N extends AgentToolName> = z.infer<(typeof agentToolInputs)[N]>;

export const AGENT_TOOL_DESCRIPTIONS: Record<AgentToolName, string> = {
  inspect_media: 'Metadados técnicos de um asset (codec, resolução, fps, duração, áudio) e diagnósticos.',
  transcribe_media: 'Transcreve a fala de um asset (cacheado por hash+modelo). Retorna transcriptId e segmentos.',
  detect_scenes: 'Detecta cortes de cena num vídeo. Retorna intervalos em segundos da fonte.',
  extract_frames: 'Extrai frames em instantes da fonte para análise visual (até 12).',
  create_edit_plan: 'Registra o plano estruturado da edição antes de aplicar alterações.',
  apply_timeline_patch:
    'Aplica operações de domínio à timeline. Exige expectedRevisionId; em conflito, releia a timeline e recalcule. Itens bloqueados não podem ser alterados.',
  generate_composition: 'Valida parâmetros de um template e devolve um item de composição pronto para inserir.',
  render_preview: 'Enfileira prévia (proxy, resolução reduzida) da revisão. Retorna jobId.',
  validate_output: 'Executa validação técnica de uma entrega. Retorna relatório.',
  render_final: 'Enfileira render final da revisão. Retorna jobId. Não publica nada.',
  export_resolve_package: 'Gera pacote de intercâmbio para DaVinci Resolve com limitações documentadas.',
  prepare_publication: 'Cria rascunho de publicação de uma entrega para uma conta. Nunca publica: exige aprovação humana.',
};

/** Orçamento por execução do agente (§19: limites de orçamento). */
export const agentBudgetSchema = z.object({
  maxTurns: z.number().int().min(1).max(100).default(20),
  maxBudgetUsd: z.number().positive().max(100).default(2),
});

export type AgentBudget = z.infer<typeof agentBudgetSchema>;
