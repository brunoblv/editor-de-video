/**
 * Projetos e revisões (RF-04, RF-08, RF-11, §8).
 *
 * `commitPatch` é o ÚNICO caminho de escrita da timeline: trava a linha do
 * projeto (SELECT … FOR UPDATE), confere expectedRevisionId, aplica e valida
 * o patch e grava a nova revisão + ponteiro atual na mesma transação. Assim
 * edições concorrentes (humano × agente) nunca se sobrescrevem (AC-06).
 */
import { randomUUID } from 'node:crypto';
import { assertTransition, DomainError, PROJECT_TRANSITIONS, type ProjectState } from '@editor-video/domain';
import {
  applyPatch,
  createTimeline,
  originSchema,
  parseTimeline,
  restoreRevision,
  type Origin,
  type TimelineDocument,
  type TimelineOperation,
  type PatchError,
  validateSemantics,
} from '@editor-video/timeline';
import { editorialHash } from '@editor-video/timeline/compile';
import type { Prisma } from '@prisma/client';
import { prisma } from '../client.js';
import { authorizeChannel, authorizeProject, listWorkspaceIds, type Actor } from './access.js';

const json = (v: unknown) => v as Prisma.InputJsonValue;

const FORMAT_SIZES: Record<string, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
};

export type CreateProjectInput = {
  channelId: string;
  seriesId?: string | null;
  title: string;
  briefing?: string | null;
  objective?: string | null;
  targetDurationSec?: number | null;
  formats: string[];
  fps?: { num: number; den: number };
  templateVersionId?: string | null;
};

export async function createProject(actor: Actor, input: CreateProjectInput) {
  const channel = await authorizeChannel(actor, input.channelId, 'project.edit');
  if (input.seriesId) {
    const series = await prisma.series.findUnique({ where: { id: input.seriesId } });
    if (!series || series.channelId !== channel.id) throw new DomainError('INVALID', 'Série não pertence ao canal.');
  }
  const formats = input.formats.length > 0 ? input.formats : ['16:9'];
  for (const f of formats) if (!FORMAT_SIZES[f]) throw new DomainError('INVALID', `Formato ${f} não suportado.`);
  const primary = FORMAT_SIZES[formats[0]!]!;
  const brandKit = await prisma.brandKitVersion.findFirst({ where: { channelId: channel.id }, orderBy: { version: 'desc' } });
  const loudness = (channel.domainJson as { loudnessProfile?: TimelineDocument['output']['loudnessProfile'] }).loudnessProfile ?? 'speech';

  return prisma.$transaction(async (tx) => {
    const project = await tx.videoProject.create({
      data: {
        workspaceId: channel.workspaceId,
        channelId: channel.id,
        seriesId: input.seriesId ?? null,
        title: input.title,
        briefing: input.briefing ?? null,
        objective: input.objective ?? null,
        targetDurationSec: input.targetDurationSec ?? null,
        formats,
        createdById: actor.userId,
      },
    });
    const revisionId = randomUUID();
    let doc = createTimeline({
      projectId: project.id,
      revisionId,
      width: primary.width,
      height: primary.height,
      fpsNumerator: input.fps?.num ?? 30,
      fpsDenominator: input.fps?.den ?? 1,
      origin: { author: 'human', userId: actor.userId },
      loudnessProfile: loudness,
      brandKitVersionId: brandKit?.id ?? null,
      templateVersionId: input.templateVersionId ?? null,
    });
    // Variantes adicionais com enquadramento próprio (RF-13).
    for (const f of formats.slice(1)) {
      const size = FORMAT_SIZES[f]!;
      doc = { ...doc, variants: [...doc.variants, { id: `v-${f.replace(':', 'x')}`, label: f, width: size.width, height: size.height, transforms: {}, textStyles: {} }] };
    }
    await tx.timelineRevision.create({
      data: {
        id: revisionId,
        projectId: project.id,
        number: 1,
        schemaVersion: doc.schemaVersion,
        documentJson: json(doc),
        editorialHash: editorialHash(doc),
        authorType: 'human',
        authorUserId: actor.userId,
        summary: 'Projeto criado',
      },
    });
    return tx.videoProject.update({ where: { id: project.id }, data: { currentRevisionId: revisionId } });
  });
}

export async function listProjects(actor: Actor, filter: { channelId?: string; state?: ProjectState; take?: number; cursor?: string } = {}) {
  const workspaceIds = await listWorkspaceIds(actor);
  return prisma.videoProject.findMany({
    where: {
      workspaceId: { in: workspaceIds },
      ...(filter.channelId ? { channelId: filter.channelId } : {}),
      ...(filter.state ? { state: filter.state } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(filter.take ?? 50, 200),
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    include: { channel: { select: { id: true, name: true, slug: true } } },
  });
}

export async function getProject(actor: Actor, projectId: string) {
  await authorizeProject(actor, projectId, 'project.view');
  const project = await prisma.videoProject.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      channel: { select: { id: true, name: true, slug: true, rulesJson: true } },
      series: true,
      currentRevision: true,
    },
  });
  return {
    ...project,
    timeline: project.currentRevision ? parseTimeline(project.currentRevision.documentJson) : null,
  };
}

export async function listRevisions(actor: Actor, projectId: string) {
  await authorizeProject(actor, projectId, 'project.view');
  return prisma.timelineRevision.findMany({
    where: { projectId },
    orderBy: { number: 'desc' },
    select: { id: true, number: true, parentRevisionId: true, authorType: true, authorUserId: true, agentRunId: true, command: true, summary: true, restoredFromRevisionId: true, editorialHash: true, createdAt: true },
  });
}

export async function getRevisionDocument(actor: Actor, projectId: string, revisionId: string): Promise<TimelineDocument> {
  await authorizeProject(actor, projectId, 'project.view');
  const revision = await prisma.timelineRevision.findFirst({ where: { id: revisionId, projectId } });
  if (!revision) throw new DomainError('NOT_FOUND', 'Revisão não encontrada.');
  return parseTimeline(revision.documentJson);
}

export class PatchRejectedError extends DomainError {
  constructor(readonly patchError: PatchError) {
    const code = patchError.code === 'CONFLICT' ? 'CONFLICT' : patchError.code === 'LOCKED' ? 'LOCKED' : patchError.code === 'FORBIDDEN' ? 'FORBIDDEN' : patchError.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INVALID';
    super(code, patchError.message, { patchError });
  }
}

export type CommitInput = {
  expectedRevisionId: string;
  operations: TimelineOperation[];
  origin: Partial<Origin> & { author: Origin['author'] };
  summary?: string;
};

/** Edições de conteúdo exigem projeto não somente leitura. */
async function lockProject(tx: Prisma.TransactionClient, projectId: string) {
  await tx.$queryRaw`SELECT id FROM "VideoProject" WHERE id = ${projectId} FOR UPDATE`;
  const project = await tx.videoProject.findUniqueOrThrow({ where: { id: projectId }, include: { currentRevision: true } });
  if (project.legacyReadOnly) throw new DomainError('FORBIDDEN', 'Projeto legado somente leitura.');
  if (!project.currentRevision) throw new DomainError('DEPENDENCY_MISSING', 'Projeto sem revisão inicial.');
  return project as typeof project & { currentRevision: NonNullable<typeof project.currentRevision> };
}

async function writeRevision(tx: Prisma.TransactionClient, projectId: string, number: number, doc: TimelineDocument, summary: string | null) {
  await tx.timelineRevision.create({
    data: {
      id: doc.revisionId,
      projectId,
      number,
      parentRevisionId: doc.parentRevisionId,
      schemaVersion: doc.schemaVersion,
      documentJson: json(doc),
      editorialHash: editorialHash(doc),
      authorType: doc.origin.author,
      authorUserId: doc.origin.userId,
      agentRunId: doc.origin.agentRunId,
      command: doc.origin.command,
      summary,
      restoredFromRevisionId: doc.origin.restoredFromRevisionId,
    },
  });
  // Mantém AssetUsage coerente para a política de retenção (§19).
  const assetIds = Object.keys(doc.assets);
  for (const assetId of assetIds) {
    await tx.assetUsage.upsert({
      where: { assetId_projectId: { assetId, projectId } },
      update: { revisionId: doc.revisionId },
      create: { assetId, projectId, revisionId: doc.revisionId },
    });
  }
  const project = await tx.videoProject.findUniqueOrThrow({ where: { id: projectId } });
  const nextState: ProjectState = project.state === 'DRAFT' || project.state === 'IN_REVIEW' || project.state === 'APPROVED' ? 'EDITING' : (project.state as ProjectState);
  if (nextState !== project.state) assertTransition('Projeto', PROJECT_TRANSITIONS, project.state as ProjectState, nextState);
  await tx.videoProject.update({ where: { id: projectId }, data: { currentRevisionId: doc.revisionId, state: nextState } });
}

export async function commitPatch(actor: Actor, projectId: string, input: CommitInput) {
  await authorizeProject(actor, projectId, 'project.edit');
  const origin = originSchema.parse({ userId: actor.userId, ...input.origin });
  return prisma.$transaction(async (tx) => {
    const project = await lockProject(tx, projectId);
    const current = parseTimeline(project.currentRevision.documentJson);
    const newRevisionId = randomUUID();
    const result = applyPatch(current, { expectedRevisionId: input.expectedRevisionId, operations: input.operations, origin }, { newRevisionId });
    if (!result.ok) throw new PatchRejectedError(result.error);
    await writeRevision(tx, projectId, project.currentRevision.number + 1, result.document, input.summary ?? null);
    return { revisionId: newRevisionId, number: project.currentRevision.number + 1, changedIds: result.changedIds, document: result.document };
  });
}

/** Substitui o documento inteiro (ex.: adicionar asset ao inventário + variante) validando tudo. */
export async function commitDocument(actor: Actor, projectId: string, expectedRevisionId: string, build: (current: TimelineDocument) => TimelineDocument, summary: string) {
  await authorizeProject(actor, projectId, 'project.edit');
  return prisma.$transaction(async (tx) => {
    const project = await lockProject(tx, projectId);
    if (project.currentRevisionId !== expectedRevisionId) {
      throw new PatchRejectedError({ code: 'CONFLICT', message: 'Revisão desatualizada.', currentRevisionId: project.currentRevisionId! });
    }
    const current = parseTimeline(project.currentRevision.documentJson);
    const next = parseTimeline({
      ...build(structuredClone(current)),
      revisionId: randomUUID(),
      parentRevisionId: current.revisionId,
      origin: originSchema.parse({ author: 'human', userId: actor.userId }),
    });
    const issues = validateSemantics(next);
    if (issues.length > 0) throw new DomainError('INVALID', issues.map((i) => i.message).join('; '), { issues });
    await writeRevision(tx, projectId, project.currentRevision.number + 1, next, summary);
    return { revisionId: next.revisionId, document: next };
  });
}

/** Restaurar = nova revisão com conteúdo antigo; histórico preservado (AC-08). */
export async function restoreProjectRevision(actor: Actor, projectId: string, targetRevisionId: string, expectedRevisionId: string) {
  await authorizeProject(actor, projectId, 'project.edit');
  return prisma.$transaction(async (tx) => {
    const project = await lockProject(tx, projectId);
    if (project.currentRevisionId !== expectedRevisionId) {
      throw new PatchRejectedError({ code: 'CONFLICT', message: 'Revisão desatualizada.', currentRevisionId: project.currentRevisionId! });
    }
    const target = await tx.timelineRevision.findFirst({ where: { id: targetRevisionId, projectId } });
    if (!target) throw new DomainError('NOT_FOUND', 'Revisão alvo não encontrada.');
    const restored = restoreRevision(parseTimeline(target.documentJson), parseTimeline(project.currentRevision.documentJson), randomUUID(), originSchema.parse({ author: 'human', userId: actor.userId }));
    await writeRevision(tx, projectId, project.currentRevision.number + 1, restored, `Restaurada a revisão ${target.number}`);
    return { revisionId: restored.revisionId };
  });
}

export async function setProjectState(actor: Actor, projectId: string, to: ProjectState) {
  const project = await authorizeProject(actor, projectId, to === 'APPROVED' ? 'deliverable.approve' : 'project.edit');
  assertTransition('Projeto', PROJECT_TRANSITIONS, project.state as ProjectState, to);
  return prisma.videoProject.update({ where: { id: projectId }, data: { state: to } });
}
