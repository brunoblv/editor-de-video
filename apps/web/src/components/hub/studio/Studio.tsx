'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatTimecode, timelineRate, type TimelineOperation } from '@editor-video/timeline';
import { api, describeError, HubApiError } from '../api';
import { ChatPanel } from './ChatPanel';
import { LeftPanel } from './LeftPanel';
import { Properties } from './Properties';
import { ReviewPanel } from './ReviewPanel';
import { Timeline } from './Timeline';
import { fileUrl, type Deliverable, type ProjectPayload, type StudioApi } from './types';

type SaveState = { kind: 'saved' | 'saving' | 'conflict' | 'error'; text: string };
type JobProgress = { jobId: string; label: string; state: string; progress: number; stage: string | null; workerOffline: boolean; error: string | null };

const RIGHT_TABS = ['Conversa com Opus', 'Propriedades', 'Revisão'] as const;

export function Studio({ projectId, initialTab }: { projectId: string; initialTab?: string }) {
  const [project, setProject] = useState<ProjectPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: 'saved', text: 'Salvo' });
  const [selection, setSelection] = useState<string[]>([]);
  const [playhead, setPlayhead] = useState(0);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<(typeof RIGHT_TABS)[number]>(initialTab === 'revisao' ? 'Revisão' : 'Conversa com Opus');
  const [panels, setPanels] = useState({ left: true, right: true });
  const [mobile, setMobile] = useState<'center' | 'left' | 'right'>('center');
  const [safeArea, setSafeArea] = useState(true);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [usage, setUsage] = useState<{ costUsd: number; agentRuns: number } | null>(null);
  const [jobs, setJobs] = useState<JobProgress[]>([]);
  const undo = useRef<string[]>([]);
  const redo = useRef<string[]>([]);
  const video = useRef<HTMLVideoElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ project: ProjectPayload }>(`/api/v3/projects/${projectId}`);
      setProject(data.project);
      setLoadError(null);
    } catch (err) {
      setLoadError(describeError(err));
    }
  }, [projectId]);

  const loadDeliverables = useCallback(async () => {
    try {
      const data = await api<{ deliverables: Deliverable[]; usage: { costUsd: number; agentRuns: number } }>(`/api/v3/projects/${projectId}/deliverables`);
      setDeliverables(data.deliverables);
      setUsage(data.usage);
    } catch {
      /* painel mostra vazio */
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    void loadDeliverables();
  }, [load, loadDeliverables]);

  const doc = project?.timeline ?? null;
  const readOnly = Boolean(project?.legacyReadOnly);

  /** Toda edição vira revisão; conflito NUNCA sobrescreve (AC-06). */
  const apply = useCallback(
    async (ops: TimelineOperation[], summary: string, opts: { keepRedo?: boolean } = {}): Promise<boolean> => {
      if (!doc) return false;
      setSave({ kind: 'saving', text: 'Salvando…' });
      try {
        await api(`/api/v3/projects/${projectId}/revisions`, { method: 'POST', json: { expectedRevisionId: doc.revisionId, operations: ops, summary } });
        undo.current.push(doc.revisionId);
        if (!opts.keepRedo) redo.current = [];
        await load();
        setSave({ kind: 'saved', text: 'Salvo' });
        return true;
      } catch (err) {
        if (err instanceof HubApiError && err.code === 'CONFLICT') {
          setSave({ kind: 'conflict', text: 'Outra edição foi salva antes (humano ou agente). Nada foi sobrescrito.' });
        } else {
          setSave({ kind: 'error', text: describeError(err) });
        }
        return false;
      }
    },
    [doc, projectId, load],
  );

  const restoreTo = useCallback(
    async (revisionId: string, stack: 'undo' | 'redo') => {
      if (!doc) return;
      setSave({ kind: 'saving', text: stack === 'undo' ? 'Desfazendo…' : 'Refazendo…' });
      try {
        await api(`/api/v3/projects/${projectId}/revisions`, { method: 'POST', json: { restoreRevisionId: revisionId, expectedRevisionId: doc.revisionId } });
        (stack === 'undo' ? redo : undo).current.push(doc.revisionId);
        await load();
        setSave({ kind: 'saved', text: 'Salvo' });
      } catch (err) {
        setSave({ kind: err instanceof HubApiError && err.code === 'CONFLICT' ? 'conflict' : 'error', text: describeError(err) });
      }
    },
    [doc, projectId, load],
  );
  const doUndo = useCallback(() => {
    const target = undo.current.pop();
    if (target) void restoreTo(target, 'undo');
  }, [restoreTo]);
  const doRedo = useCallback(() => {
    const target = redo.current.pop();
    if (target) void restoreTo(target, 'redo');
  }, [restoreTo]);

  const fps = doc ? timelineRate(doc) : { num: 30, den: 1 };
  const fpsNum = fps.num / fps.den;

  const seek = useCallback(
    (frame: number) => {
      setPlayhead(frame);
      if (video.current) video.current.currentTime = frame / fpsNum;
    },
    [fpsNum],
  );

  // Atalhos de teclado (documentados em Configurações).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
      } else if (e.key === ' ') {
        e.preventDefault();
        const v = video.current;
        if (v) v.paused ? void v.play() : v.pause();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const step = e.shiftKey ? Math.round(fpsNum) : 1;
        seek(Math.max(0, playhead + (e.key === 'ArrowLeft' ? -step : step)));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doUndo, doRedo, seek, playhead, fpsNum]);

  // Prévia exibida: a mais recente PRONTA da revisão + variante atuais; senão a última disponível.
  const shown = useMemo(() => {
    const ready = deliverables.filter((d) => (d.kind === 'PREVIEW' || d.kind === 'FINAL') && d.state === 'READY' && d.storageKey && (d.variantId ?? null) === variantId);
    const exact = ready.find((d) => d.revisionId === doc?.revisionId);
    return { deliverable: exact ?? ready[0] ?? null, stale: !exact && Boolean(ready[0]) };
  }, [deliverables, doc?.revisionId, variantId]);

  const track = useCallback(
    (jobId: string, label: string) => {
      setJobs((j) => [...j.filter((x) => x.jobId !== jobId), { jobId, label, state: 'QUEUED', progress: 0, stage: null, workerOffline: false, error: null }]);
      const es = new EventSource(`/api/v3/jobs/${jobId}/events`);
      es.onmessage = (event) => {
        const s = JSON.parse(event.data) as { state: string; progress: number; stage: string | null; workerOffline: boolean; errorMessage: string | null };
        setJobs((j) => j.map((x) => (x.jobId === jobId ? { ...x, state: s.state, progress: s.progress, stage: s.stage, workerOffline: s.workerOffline, error: s.errorMessage } : x)));
        if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(s.state)) {
          es.close();
          void loadDeliverables();
        }
      };
      es.onerror = () => es.close();
    },
    [loadDeliverables],
  );

  const render = async (quality: 'preview' | 'final') => {
    if (!doc) return;
    try {
      const { jobId } = await api<{ jobId: string }>(`/api/v3/revisions/${doc.revisionId}/renders`, { method: 'POST', json: { quality, variantId } });
      track(jobId, quality === 'preview' ? 'Prévia' : 'Render final');
    } catch (err) {
      setSave({ kind: 'error', text: describeError(err) });
    }
  };
  const exportResolve = async () => {
    if (!doc) return;
    try {
      const { jobId } = await api<{ jobId: string }>(`/api/v3/revisions/${doc.revisionId}/resolve-export`, { method: 'POST' });
      track(jobId, 'Pacote Resolve');
    } catch (err) {
      setSave({ kind: 'error', text: describeError(err) });
    }
  };
  const cancelJob = async (jobId: string) => {
    await api(`/api/v3/jobs/${jobId}/cancel`, { method: 'POST' }).catch((err) => setSave({ kind: 'error', text: describeError(err) }));
  };

  if (loadError) return <div className="notice" data-tone="err" role="alert">{loadError} <button onClick={() => void load()}>Tentar de novo</button></div>;
  if (!project || !doc) return <div className="state" role="status">Abrindo estúdio…</div>;

  const studio: StudioApi = { doc, readOnly, apply: (ops, summary) => apply(ops, summary), reload: load, playhead, seek, selection, select: setSelection, variantId };
  const variants = [{ id: null as string | null, label: `Principal ${doc.video.width}×${doc.video.height}` }, ...doc.variants.filter((v) => v.id !== 'base').map((v) => ({ id: v.id, label: `${v.label} ${v.width}×${v.height}` }))];
  const frameSize = variantId ? doc.variants.find((v) => v.id === variantId) ?? doc.video : doc.video;

  return (
    <div className="studio">
      <div className="studio-top" role="toolbar" aria-label="Barra do estúdio">
        <a href={`/hub/canais/${project.channel.id}`} className="chip">{project.channel.name}</a>
        <strong>{project.title}</strong>
        <span className="muted">Rev {project.currentRevision?.number ?? '?'}</span>
        <span className="chip" data-tone={save.kind === 'saved' ? 'ok' : save.kind === 'saving' ? 'warn' : 'err'} role="status" aria-live="polite">
          {save.kind === 'saved' ? '✓ ' : save.kind === 'saving' ? '… ' : '! '}
          {save.text}
        </span>
        {save.kind === 'conflict' && <button onClick={() => void load().then(() => setSave({ kind: 'saved', text: 'Revisão atual carregada' }))}>Carregar revisão atual</button>}
        {readOnly && <span className="chip" data-tone="warn">Projeto legado — somente leitura</span>}
        <span className="spacer" />
        <button onClick={doUndo} disabled={readOnly || undo.current.length === 0} title="Desfazer (Ctrl+Z)">↶ Desfazer</button>
        <button onClick={doRedo} disabled={readOnly || redo.current.length === 0} title="Refazer (Ctrl+Shift+Z)">↷ Refazer</button>
        <button onClick={() => void render('preview')} disabled={doc.video.durationFrames === 0}>Prévia</button>
        <button className="primary" onClick={() => void render('final')} disabled={doc.video.durationFrames === 0}>Exportar</button>
        <button onClick={() => void exportResolve()} disabled={doc.video.durationFrames === 0} title="Pacote de intercâmbio para DaVinci Resolve">Resolve</button>
        <button className="ghost" onClick={() => setPanels((p) => ({ ...p, left: !p.left }))} aria-pressed={panels.left}>Painel esq.</button>
        <button className="ghost" onClick={() => setPanels((p) => ({ ...p, right: !p.right }))} aria-pressed={panels.right}>Painel dir.</button>
        <span className="row" style={{ gap: 4 }} aria-label="Painel em telas pequenas">
          {(['left', 'center', 'right'] as const).map((m) => <button key={m} className="ghost" aria-pressed={mobile === m} onClick={() => setMobile(m)}>{m === 'left' ? 'Mídias' : m === 'center' ? 'Player' : 'Opus'}</button>)}
        </span>
      </div>

      {jobs.slice(-3).map((j) => (
        <div key={j.jobId} className="notice" data-tone={j.state === 'FAILED' ? 'err' : j.state === 'SUCCEEDED' ? 'ok' : undefined} role="status">
          {j.label}: {j.state}{j.stage ? ` — ${j.stage}` : ''} {j.state === 'RUNNING' && <progress value={j.progress} max={1} />}
          {j.workerOffline && ' · worker sem sinal: verifique o render-worker'}
          {j.error && ` · ${j.error}`}
          {['QUEUED', 'RUNNING'].includes(j.state) && <button className="ghost" onClick={() => void cancelJob(j.jobId)}>Cancelar</button>}
          {['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(j.state) && <button className="ghost" onClick={() => setJobs((x) => x.filter((y) => y.jobId !== j.jobId))}>Fechar</button>}
        </div>
      ))}

      <div className="studio-body" data-left={panels.left ? 'open' : 'closed'} data-right={panels.right ? 'open' : 'closed'} data-mobile={mobile}>
        <aside className="studio-panel left" aria-label="Mídias, cenas, transcrição e templates">
          <LeftPanel studio={studio} projectId={projectId} channelId={project.channel.id} />
        </aside>

        <section className="studio-center" aria-label="Player">
          <div className="player-meta">
            <label>
              Formato{' '}
              <select value={variantId ?? ''} onChange={(e) => setVariantId(e.target.value || null)} aria-label="Formato exibido">
                {variants.map((v) => <option key={v.id ?? 'base'} value={v.id ?? ''}>{v.label}</option>)}
              </select>
            </label>
            <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={safeArea} onChange={(e) => setSafeArea(e.target.checked)} />Área segura</label>
            <span className="timecode">{formatTimecode(playhead, fps)}</span>
            <span>/ {formatTimecode(doc.video.durationFrames, fps)}</span>
          </div>
          <div className="player-frame" style={{ aspectRatio: `${frameSize.width} / ${frameSize.height}`, maxHeight: '100%', margin: '0 auto' }}>
            {shown.deliverable?.storageKey ? (
              <>
                <video
                  ref={video}
                  key={shown.deliverable.id}
                  src={fileUrl(shown.deliverable.storageKey)}
                  controls
                  playsInline
                  onTimeUpdate={(e) => setPlayhead(Math.round(e.currentTarget.currentTime * fpsNum))}
                  aria-label="Prévia renderizada"
                />
                {safeArea && <div className="safe" style={{ inset: '6%' }} aria-hidden />}
              </>
            ) : (
              <div className="state">
                {doc.video.durationFrames === 0 ? 'Timeline vazia: adicione mídias em “Mídias” ou peça ao Opus.' : 'Sem prévia desta revisão. Clique em “Prévia” para renderizar (usa proxies).'}
              </div>
            )}
          </div>
          {shown.deliverable && (
            <div className="player-meta">
              Exibindo {shown.deliverable.kind === 'PREVIEW' ? 'prévia' : 'entrega final'} da rev {shown.deliverable.revision?.number ?? '?'}
              {shown.stale && <span className="chip" data-tone="warn">desatualizada em relação à rev {project.currentRevision?.number}</span>}
              {usage && <span>· Agente: {usage.agentRuns} execução(ões), US$ {usage.costUsd.toFixed(4)}</span>}
            </div>
          )}
        </section>

        <aside className="studio-panel right" aria-label="Conversa, propriedades e revisão">
          <div className="tabs" role="tablist">
            {RIGHT_TABS.map((t) => <button key={t} role="tab" aria-selected={rightTab === t} onClick={() => setRightTab(t)}>{t}</button>)}
          </div>
          {rightTab === 'Conversa com Opus' && <ChatPanel studio={studio} projectId={projectId} />}
          {rightTab === 'Propriedades' && <Properties studio={studio} />}
          {rightTab === 'Revisão' && <ReviewPanel studio={studio} projectId={projectId} channelId={project.channel.id} deliverables={deliverables} reloadDeliverables={loadDeliverables} />}
        </aside>
      </div>

      <Timeline studio={studio} />
    </div>
  );
}
