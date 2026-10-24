/**
 * Ferramentas do agente contra Postgres real, sem chamar o modelo
 * (V3_TEST_DATABASE_URL). Verifica AC-04 (escopo/bloqueio) e AC-06
 * (conflito) na fronteira que o Opus usa.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

const url = process.env.V3_TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

describe('ferramentas do hub para o agente', { skip: !url }, () => {
  let v3: typeof import('@editor-video/db/v3');
  let db: typeof import('@editor-video/db');
  let tools: ReturnType<typeof import('../src/tools.js').buildHubTools>;
  let state: import('../src/tools.js').AgentRunState;
  let projectId: string;
  const userId = `agent-${randomUUID()}`;
  const call = async (name: string, args: Record<string, unknown>) => {
    const t = tools.find((x) => x.name === name)!;
    const result = (await t.handler(args as never, {})) as { content: Array<{ text?: string }>; isError?: boolean };
    return { isError: Boolean(result.isError), text: result.content.map((c) => c.text ?? '').join('\n') };
  };

  before(async () => {
    v3 = await import('@editor-video/db/v3');
    db = await import('@editor-video/db');
    const { buildHubTools } = await import('../src/tools.js');
    await db.prisma.user.create({ data: { id: userId, email: `${userId}@test.local`, passwordHash: 'x' } });
    await v3.ensureWorkspaceForUser(userId, 'Agente');
    const channel = (await v3.listChannels({ userId })).find((c) => c.slug === 'rabisco')!;
    const project = await v3.createProject({ userId }, { channelId: channel.id, title: 'Agente', formats: ['9:16'] });
    projectId = project.id;
    const { parseItem } = await import('@editor-video/timeline');
    await v3.commitPatch({ userId }, projectId, {
      expectedRevisionId: project.currentRevisionId!,
      operations: [
        { op: 'insertClip', trackId: 'T1', item: parseItem({ id: 'titulo', kind: 'text', text: 'Original', timelineStart: 0, duration: 30, locked: true }) },
        { op: 'insertClip', trackId: 'C1', item: parseItem({ id: 'leg', kind: 'caption', text: 'ola', timelineStart: 0, duration: 30 }) },
      ],
      origin: { author: 'human' },
    });
    state = { actor: { userId }, projectId, runId: 'test-run', plan: null, lastRevisionId: null, calls: [] };
    tools = buildHubTools(state);
  });

  after(async () => {
    await v3.closeQueues();
    await db.prisma.$disconnect();
  });

  it('read_timeline expõe revisão atual e bloqueios', async () => {
    const r = await call('read_timeline', {});
    assert.equal(r.isError, false);
    assert.match(r.text, /bloqueados: titulo/);
  });

  it('AC-04: não altera item bloqueado e não pode desbloquear', async () => {
    const rev = state.lastRevisionId!;
    const locked = await call('apply_timeline_patch', { projectId, expectedRevisionId: rev, operations: [{ op: 'updateText', itemId: 'titulo', text: 'Agente' }], summary: 'x' });
    assert.equal(locked.isError, true);
    assert.match(locked.text, /LOCKED/);
    const unlock = await call('apply_timeline_patch', { projectId, expectedRevisionId: rev, operations: [{ op: 'setLock', itemId: 'titulo', locked: false }], summary: 'x' });
    assert.match(unlock.text, /FORBIDDEN/);
  });

  it('aplica no escopo e rejeita revisão antiga (AC-06)', async () => {
    const rev = state.lastRevisionId!;
    const okPatch = await call('apply_timeline_patch', { projectId, expectedRevisionId: rev, operations: [{ op: 'updateCaptions', edits: [{ itemId: 'leg', text: 'Olá' }] }], summary: 'acento' });
    assert.equal(okPatch.isError, false, okPatch.text);
    const stale = await call('apply_timeline_patch', { projectId, expectedRevisionId: rev, operations: [{ op: 'updateCaptions', edits: [{ itemId: 'leg', text: 'Oi' }] }], summary: 'stale' });
    assert.match(stale.text, /CONFLICT/);
    const project = await v3.getProject({ userId }, projectId);
    const caption = project.timeline!.tracks.find((t) => t.id === 'C1')!.items[0]!;
    assert.equal(caption.kind === 'caption' && caption.text, 'Olá');
    const title = project.timeline!.tracks.find((t) => t.id === 'T1')!.items[0]!;
    assert.equal(title.kind === 'text' && title.text, 'Original');
    const revs = await v3.listRevisions({ userId }, projectId);
    assert.equal(revs[0]!.authorType, 'agent');
  });

  it('generate_composition valida parâmetros e arquivos exigidos', async () => {
    const tv = await db.prisma.templateVersion.findFirstOrThrow({ where: { slug: 'rabisco-scene', channel: { workspace: { memberships: { some: { userId } } } } } });
    const bad = await call('generate_composition', { templateVersionId: tv.id, params: { animation: 'explode' } });
    assert.equal(bad.isError, true);
    const missing = await call('generate_composition', { templateVersionId: tv.id, params: { animation: 'fade' } });
    assert.match(missing.text, /\$file:assets\/character\.png/);
  });

  it('não acessa projeto de outro usuário', async () => {
    const other = `intruso-${randomUUID()}`;
    await db.prisma.user.create({ data: { id: other, email: `${other}@test.local`, passwordHash: 'x' } });
    await v3.ensureWorkspaceForUser(other, 'X');
    const { buildHubTools } = await import('../src/tools.js');
    const intruder = buildHubTools({ actor: { userId: other }, projectId, runId: 'r', plan: null, lastRevisionId: null, calls: [] });
    const r = (await intruder.find((t) => t.name === 'read_timeline')!.handler({} as never, {})) as { isError?: boolean };
    assert.equal(r.isError, true);
  });
});
