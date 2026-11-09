'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { framesToMs, lyricIssuesInTimeline, lyricLines, msToFrames, timelineRate, type TimelineOperation } from '@editor-video/timeline';
import { api, describeError, formatDateTime, HubApiError } from '../api';
import { ReviewPanel } from '../studio/ReviewPanel';
import { fileUrl, type Deliverable, type ProjectPayload, type StudioApi } from '../studio/types';
import { LyricsPanel } from './LyricsPanel';
import { LyricsProperties } from './LyricsProperties';
import { LyricsWaveform } from './LyricsWaveform';
import { formatMs, type LyricsMap, type LyricsPresetInfo, type LyricsState, type LyricsStudioApi } from './types';

type SaveState = { kind: 'saved' | 'saving' | 'conflict' | 'error'; text: string };
type JobProgress = { jobId: string; label: string; state: string; progress: number; stage: string | null; workerOffline: boolean; error: string | null };
const TABS = ['Letra', 'Visual', 'Render', 'Revisão'] as const;
const PREVIEW_WINDOW_MS = 8000;

/**
 * Estúdio do Reactive Lyrics: ouvir o áudio original, ajustar a letra sobre a
 * waveform, configurar o visual e renderizar trechos/finais. Toda edição é
 * uma revisão V3 (expectedRevisionId); conflito nunca sobrescreve.
 */
export function LyricsStudio({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectPayload | null>(null);
  const [state, setState] = useState<LyricsState | null>(null);
  const [map, setMap] = useState<LyricsMap | null>(null);
  const [presets, setPresets] = useState<LyricsPresetInfo[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: 'saved', text: 'Salvo' });
  const [tab, setTab] = useState<(typeof TABS)[number]>('Letra');
  const [playheadMs, setPlayheadMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [loop, setLoop] = useState<{ startMs: number; endMs: number } | null>(null);
  const [view, setView] = useState<'audio' | 'video'>('audio');
  const [variantId, setVariantId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobProgress[]>([]);
  const [reimport, setReimport] = useState<{ open: boolean; content: string; fileName: string | null; skipped: Array<{ text: string; reason: string }> }>({ open: false, content: '', fileName: null, skipped: [] });
  const audio = useRef<HTMLAudioElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const undo = useRef<string[]>([]);
  const redo = useRef<string[]>([]);

  const loadProject = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([api<{ project: ProjectPayload }>(`/api/v3/projects/${projectId}`), api<LyricsState>(`/api/v3/projects/${projectId}/lyrics`)]);
      setProject(p.project);
      setState(s);
      setLoadError(null);
    } catch (err) {
      setLoadError(describeError(err));
    }
  }, [projectId]);
  const loadDeliverables = useCallback(async () => {
    const data = await api<{ deliverables: Deliverable[] }>(`/api/v3/projects/${projectId}/deliverables`).catch(() => null);
    if (data) setDeliverables(data.deliverables);
  }, [projectId]);

  useEffect(() => {
    void loadProject();
    void loadDeliverables();
    void api<{ presets: LyricsPresetInfo[] }>('/api/v3/lyrics/projects').then((d) => setPresets(d.presets)).catch(() => undefined);
  }, [loadProject, loadDeliverables]);

  // Mapa musical: carrega quando a análise termina; enquanto isso, acompanha o job.
  const analysisReady = Boolean(state?.analysis.ready);
  useEffect(() => {
    if (analysisReady) void api<LyricsMap>(`/api/v3/projects/${projectId}/lyrics/map`).then(setMap).catch(() => setMap(null));
  }, [analysisReady, projectId]);
  // Enquanto análise ou transcrição estão na fila, atualiza o estado.
  const transcribing = ['QUEUED', 'RUNNING'].includes(state?.transcription.job?.state ?? '');
  useEffect(() => {
    if (!state || (analysisReady && !transcribing)) return;
    const timer = setInterval(() => void loadProject(), 4000);
    return () => clearInterval(timer);
  }, [analysisReady, transcribing, state, loadProject]);

  const doc = project?.timeline ?? null;
  const fps = doc ? timelineRate(doc) : { num: 30, den: 1 };
  const segment = state?.segment;
  const durationMs = doc ? framesToMs(doc.video.durationFrames, fps) : 0;
  // QA ao vivo pelo documento exibido (o servidor confere de novo antes do final).
  const issues = useMemo(() => (doc ? lyricIssuesInTimeline(doc) : []), [doc]);

  const apply = useCallback(
    async (ops: TimelineOperation[], summary: string, opts: { keepRedo?: boolean } = {}): Promise<boolean> => {
      if (!doc) return false;
      setSave({ kind: 'saving', text: 'Salvando…' });
      try {
        await api(`/api/v3/projects/${projectId}/revisions`, { method: 'POST', json: { expectedRevisionId: doc.revisionId, operations: ops, summary } });
        undo.current.push(doc.revisionId);
        if (!opts.keepRedo) redo.current = [];
        await loadProject();
        setSave({ kind: 'saved', text: 'Salvo' });
        return true;
      } catch (err) {
        setSave({ kind: err instanceof HubApiError && err.code === 'CONFLICT' ? 'conflict' : 'error', text: err instanceof HubApiError && err.code === 'CONFLICT' ? 'Outra edição foi salva antes. Nada foi sobrescrito.' : describeError(err) });
        return false;
      }
    },
    [doc, projectId, loadProject],
  );

  const restoreTo = useCallback(
    async (revisionId: string, stack: 'undo' | 'redo') => {
      if (!doc) return;
      setSave({ kind: 'saving', text: stack === 'undo' ? 'Desfazendo…' : 'Refazendo…' });
      try {
        await api(`/api/v3/projects/${projectId}/revisions`, { method: 'POST', json: { restoreRevisionId: revisionId, expectedRevisionId: doc.revisionId } });
        (stack === 'undo' ? redo : undo).current.push(doc.revisionId);
        await loadProject();
        setSave({ kind: 'saved', text: 'Salvo' });
      } catch (err) {
        setSave({ kind: 'error', text: describeError(err) });
      }
    },
    [doc, projectId, loadProject],
  );

  // Áudio original do trecho: o playhead é o tempo da timeline (0 = início do trecho).
  const seekMs = useCallback(
    (ms: number) => {
      const clamped = Math.max(0, Math.min(durationMs, ms));
      setPlayheadMs(clamped);
      if (audio.current && segment) audio.current.currentTime = (segment.startMs + clamped) / 1000;
      if (video.current) video.current.currentTime = clamped / 1000;
    },
    [durationMs, segment],
  );
  const togglePlay = useCallback(() => {
    const media = view === 'audio' ? audio.current : video.current;
    if (!media) return;
    if (media.paused) {
      if (view === 'audio' && segment && (media.currentTime * 1000 < segment.startMs || media.currentTime * 1000 >= segment.startMs + durationMs)) media.currentTime = segment.startMs / 1000;
      void media.play();
    } else media.pause();
  }, [view, segment, durationMs]);

  const onAudioTime = () => {
    const a = audio.current;
    if (!a || !segment) return;
    const t = a.currentTime * 1000 - segment.startMs;
    if (loop && t >= loop.endMs) {
      a.currentTime = (segment.startMs + loop.startMs) / 1000;
      return;
    }
    if (t >= durationMs) {
      a.pause();
      a.currentTime = segment.startMs / 1000;
    }
    setPlayheadMs(Math.max(0, Math.min(durationMs, t)));
  };
  // requestAnimationFrame dá um playhead mais fluido que o timeupdate (~4 Hz).
  useEffect(() => {
    if (!playing) return;
    let id = 0;
    const tick = () => {
      if (view === 'audio') onAudioTime();
      else if (video.current) setPlayheadMs(video.current.currentTime * 1000);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const target = (e.shiftKey ? redo : undo).current.pop();
        if (target) void restoreTo(target, e.shiftKey ? 'redo' : 'undo');
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const step = e.shiftKey ? 1000 : (1000 * fps.den) / fps.num;
        seekMs(playheadMs + (e.key === 'ArrowLeft' ? -step : step));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [restoreTo, togglePlay, seekMs, playheadMs, fps]);

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
          void loadProject();
        }
      };
      es.onerror = () => es.close();
    },
    [loadDeliverables, loadProject],
  );

  const render = async (quality: 'preview' | 'final', variant: string | null, rangeMs: { startMs: number; endMs: number } | null) => {
    if (!doc) return;
    const range = rangeMs ? { startFrame: msToFrames(rangeMs.startMs, fps), endFrame: Math.min(doc.video.durationFrames, msToFrames(rangeMs.endMs, fps)) } : null;
    try {
      const { jobId } = await api<{ jobId: string }>(`/api/v3/revisions/${doc.revisionId}/renders`, { method: 'POST', json: { quality, variantId: variant, range } });
      const label = `${quality === 'preview' ? 'Prévia' : 'Final'} ${variant ? variantLabel(variant) : formats[0]}${rangeMs ? ` ${formatMs(rangeMs.startMs)}–${formatMs(rangeMs.endMs)}` : ''}`;
      track(jobId, label);
      setTab('Render');
    } catch (err) {
      setSave({ kind: 'error', text: describeError(err) });
    }
  };

  const declareRights = async (declared: boolean) => {
    const note = declared ? window.prompt('Origem/autorização (ex.: “faixa própria”, “licença X”):', state?.lyrics.rightsNote ?? '') : null;
    if (declared && note === null) return;
    try {
      await api(`/api/v3/projects/${projectId}/lyrics/rights`, { method: 'POST', json: { declared, note } });
      await loadProject();
    } catch (err) {
      setSave({ kind: 'error', text: describeError(err) });
    }
  };

  const transcribe = async () => {
    try {
      await api(`/api/v3/projects/${projectId}/lyrics/transcribe`, { method: 'POST' });
      await loadProject();
    } catch (err) {
      setSave({ kind: 'error', text: describeError(err) });
    }
  };
  const applyTranscript = async () => {
    if (!doc || !window.confirm('Substituir as linhas não validadas pela transcrição? As validadas ficam como estão.')) return;
    try {
      const r = await api<{ skipped: Array<{ text: string; reason: string }> }>(`/api/v3/projects/${projectId}/lyrics/transcript`, { method: 'POST', json: { expectedRevisionId: doc.revisionId } });
      if (r.skipped.length) setReimport({ open: true, content: '', fileName: null, skipped: r.skipped });
      await loadProject();
    } catch (err) {
      setSave({ kind: 'error', text: describeError(err) });
    }
  };

  const doReimport = async () => {
    if (!doc) return;
    try {
      const r = await api<{ skipped: Array<{ text: string; reason: string }> }>(`/api/v3/projects/${projectId}/lyrics/import`, { method: 'POST', json: { content: reimport.content, fileName: reimport.fileName, expectedRevisionId: doc.revisionId } });
      setReimport({ open: r.skipped.length > 0, content: '', fileName: null, skipped: r.skipped });
      await loadProject();
    } catch (err) {
      setSave({ kind: 'error', text: describeError(err) });
    }
  };

  if (loadError) return <div className="notice" data-tone="err" role="alert">{loadError} <button onClick={() => void loadProject()}>Tentar de novo</button></div>;
  if (!project || !doc || !state || !segment) return <div className="state" role="status">Abrindo o Reactive Lyrics…</div>;

  const formats = project.formats.length ? project.formats : ['9:16'];
  const variants = [{ id: null as string | null, label: formats[0]! }, ...doc.variants.filter((v) => v.id !== 'base').map((v) => ({ id: v.id as string | null, label: v.label }))];
  function variantLabel(id: string) {
    return variants.find((v) => v.id === id)?.label ?? id;
  }
  const studioApi: LyricsStudioApi = { doc, apply, playheadMs, seekMs, selected, select: setSelected, loop, setLoop };
  const reviewStudio: StudioApi = { doc, readOnly: false, apply, reload: loadProject, playhead: msToFrames(playheadMs, fps), seek: (f) => seekMs(framesToMs(f, fps)), selection: selected ? [selected] : [], select: (ids) => setSelected(ids[0] ?? null), variantId };
  const frame = doc.variants.find((v) => v.id === variantId) ?? doc.video;
  const ready = deliverables.filter((d) => (d.kind === 'PREVIEW' || d.kind === 'FINAL') && d.state === 'READY' && d.storageKey && (d.variantId ?? null) === variantId);
  const shown = ready.find((d) => d.revisionId === doc.revisionId) ?? ready[0] ?? null;
  const shownRange = (shown?.validationJson as { range?: { startFrame: number } } | null)?.range ?? null;
  const errors = issues.filter((i) => i.severity === 'error');
  const current = lyricLines(doc).filter((l) => playheadMs >= framesToMs(l.timelineStart, fps) && playheadMs < framesToMs(l.timelineStart + l.duration, fps));
  const previewRange = loop ?? { startMs: playheadMs, endMs: Math.min(durationMs, playheadMs + PREVIEW_WINDOW_MS) };

  return (
    <div className="studio">
      <div className="studio-top" role="toolbar" aria-label="Barra do Reactive Lyrics">
        <a href={`/hub/canais/${project.channel.id}`} className="chip">{project.channel.name}</a>
        <strong>{project.title}</strong>
        <span className="chip">Reactive Lyrics</span>
        <span className="muted">Rev {project.currentRevision?.number ?? '?'}</span>
        <span className="chip" data-tone={save.kind === 'saved' ? 'ok' : save.kind === 'saving' ? 'warn' : 'err'} role="status" aria-live="polite">{save.text}</span>
        {save.kind === 'conflict' && <button onClick={() => void loadProject().then(() => setSave({ kind: 'saved', text: 'Revisão atual carregada' }))}>Carregar revisão atual</button>}
        <span className="chip" data-tone={state.analysis.ready ? 'ok' : state.analysis.job?.state === 'FAILED' ? 'err' : 'warn'} title={state.analysis.job?.errorMessage ?? undefined}>
          {state.analysis.ready ? `Análise ok${state.analysis.bpm ? ` · ${state.analysis.bpm.toFixed(0)} BPM` : ''}` : state.analysis.job?.state === 'FAILED' ? 'Análise falhou' : `Analisando música${state.analysis.job?.stage ? ` (${state.analysis.job.stage})` : ''}`}
        </span>
        {state.analysis.job?.state === 'FAILED' && <button onClick={() => void api(`/api/v3/projects/${projectId}/lyrics/analyze`, { method: 'POST' }).then(loadProject)}>Analisar de novo</button>}
        <button className="chip" data-tone={state.lyrics.rightsDeclaredAt ? 'ok' : 'err'} onClick={() => void declareRights(!state.lyrics.rightsDeclaredAt)} title={state.lyrics.rightsNote ?? 'Exigido para o render final'}>
          {state.lyrics.rightsDeclaredAt ? 'Direitos declarados' : 'Declarar direitos'}
        </button>
        <span className="spacer" />
        <button onClick={() => { const t = undo.current.pop(); if (t) void restoreTo(t, 'undo'); }} disabled={undo.current.length === 0} title="Desfazer (Ctrl+Z)">↶</button>
        <button onClick={() => { const t = redo.current.pop(); if (t) void restoreTo(t, 'redo'); }} disabled={redo.current.length === 0} title="Refazer (Ctrl+Shift+Z)">↷</button>
        <button onClick={() => void render('preview', variantId, previewRange)} disabled={!state.analysis.ready} title={loop ? 'Renderiza o trecho em loop' : 'Renderiza 8 s a partir do playhead'}>Prévia do trecho</button>
      </div>

      {jobs.slice(-3).map((j) => (
        <div key={j.jobId} className="notice" data-tone={j.state === 'FAILED' ? 'err' : j.state === 'SUCCEEDED' ? 'ok' : undefined} role="status">
          {j.label}: {j.state}{j.stage ? ` — ${j.stage}` : ''} {j.state === 'RUNNING' && <progress value={j.progress} max={1} />}
          {j.workerOffline && ' · worker sem sinal: verifique o render-worker'}
          {j.error && ` · ${j.error}`}
          {['QUEUED', 'RUNNING'].includes(j.state) && <button className="ghost" onClick={() => void api(`/api/v3/jobs/${j.jobId}/cancel`, { method: 'POST' })}>Cancelar</button>}
          {['FAILED', 'CANCELLED'].includes(j.state) && <button className="ghost" onClick={() => void api<{ jobId: string }>(`/api/v3/jobs/${j.jobId}/retry`, { method: 'POST' }).then(() => track(j.jobId, j.label)).catch((err) => setSave({ kind: 'error', text: describeError(err) }))}>Tentar de novo</button>}
          {['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(j.state) && <button className="ghost" onClick={() => setJobs((x) => x.filter((y) => y.jobId !== j.jobId))}>Fechar</button>}
        </div>
      ))}

      <div className="lyrics-body">
        <div className="lyrics-main">
          <div className="lyrics-player">
            <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0,1fr)', gap: 6, minHeight: 0 }}>
              <div className="player-meta">
                <span className="row" style={{ gap: 4 }}>
                  <button className="ghost" aria-pressed={view === 'audio'} onClick={() => { video.current?.pause(); setView('audio'); }}>Áudio original</button>
                  <button className="ghost" aria-pressed={view === 'video'} onClick={() => { audio.current?.pause(); setView('video'); }} disabled={!shown}>Prévia renderizada</button>
                </span>
                <select value={variantId ?? ''} onChange={(e) => setVariantId(e.target.value || null)} aria-label="Formato">
                  {variants.map((v) => <option key={v.id ?? 'base'} value={v.id ?? ''}>{v.label}</option>)}
                </select>
              </div>
              <div className="player-frame" style={{ aspectRatio: `${frame.width} / ${frame.height}` }}>
                {view === 'video' && shown?.storageKey ? (
                  <video
                    ref={video}
                    key={shown.id}
                    src={fileUrl(shown.storageKey)}
                    controls
                    playsInline
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onTimeUpdate={(e) => !playing && setPlayheadMs(e.currentTarget.currentTime * 1000 + (shownRange ? framesToMs(shownRange.startFrame, fps) : 0))}
                    aria-label="Prévia renderizada"
                  />
                ) : (
                  <div className="state" style={{ padding: 12 }}>
                    {view === 'video' ? 'Nenhuma prévia pronta neste formato.' : <>Ouvindo o áudio original ({state.audio.originalName}). Use <span className="lyrics-kbd">Espaço</span> para tocar.</>}
                  </div>
                )}
              </div>
            </div>
            <div className="lyrics-now" aria-live="polite">
              <div className="row" style={{ gap: 8 }}>
                <button className="primary" onClick={togglePlay}>{playing ? 'Pausar' : 'Tocar'}</button>
                <span className="timecode">{formatMs(playheadMs)}</span>
                <span className="muted">/ {formatMs(durationMs)} · trecho {formatMs(segment.startMs)}–{formatMs(segment.startMs + segment.durationMs)} da música</span>
              </div>
              {current.length === 0 && <div className="muted">—</div>}
              {current.map((line) => (
                <div key={line.id} className="line">
                  {line.words.length > 0
                    ? line.words.map((w, i) => {
                        const s = framesToMs(w.start, fps);
                        const e = framesToMs(w.end, fps);
                        return <span key={i} className="w" data-s={playheadMs >= e ? 'done' : playheadMs >= s ? 'on' : undefined}>{w.text} </span>;
                      })
                    : <span className="w" data-s="on">{line.text}</span>}
                </div>
              ))}
              {shown && view === 'video' && <div className="muted" style={{ fontSize: 12 }}>Exibindo {shown.kind === 'PREVIEW' ? 'prévia' : 'final'} da rev {shown.revision?.number}{shownRange ? ' (trecho)' : ''}{shown.revisionId !== doc.revisionId ? ' — desatualizada' : ''}</div>}
              <audio ref={audio} src={fileUrl(state.audio.storageKey)} preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={() => !playing && onAudioTime()} />
            </div>
          </div>
          <LyricsWaveform studio={studioApi} map={map} durationMs={durationMs} />
        </div>

        <aside className="studio-panel" aria-label="Letra, visual, render e revisão">
          <div className="tabs" role="tablist">
            {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}{t === 'Letra' && errors.length > 0 ? ` (${errors.length})` : ''}</button>)}
          </div>
          {tab === 'Letra' && (
            <>
              <div className="card" style={{ display: 'grid', gap: 6, marginBottom: 8, fontSize: 13 }}>
                <strong>Letra automática (Whisper local)</strong>
                {state.transcription.job && ['QUEUED', 'RUNNING'].includes(state.transcription.job.state) && <span role="status">Transcrevendo… {state.transcription.job.stage ?? ''} (a primeira vez baixa o modelo)</span>}
                {state.transcription.job?.state === 'FAILED' && <span style={{ color: 'var(--accent)' }}>{state.transcription.job.errorMessage}</span>}
                {state.transcription.available && <span className="muted">Transcrição pronta ({state.transcription.model}, {state.transcription.language}). Confira cada linha: o Whisper erra palavras cantadas.</span>}
                <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <button disabled={transcribing} onClick={() => void transcribe()}>{state.transcription.available ? 'Transcrever de novo' : 'Transcrever a letra'}</button>
                  {state.transcription.available && <button onClick={() => void applyTranscript()}>Aplicar transcrição</button>}
                </span>
              </div>
              {reimport.open && (
                <div className="card" style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
                  <strong>Reimportar letra</strong>
                  <span className="muted" style={{ fontSize: 12 }}>Substitui as linhas não validadas. Linhas validadas ficam como estão.</span>
                  <input type="file" accept=".txt,.lrc,.srt,.vtt" onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then((content) => setReimport((r) => ({ ...r, content, fileName: f.name }))); }} />
                  <textarea rows={6} value={reimport.content} onChange={(e) => setReimport((r) => ({ ...r, content: e.target.value }))} placeholder="Ou cole TXT, LRC, SRT ou VTT" />
                  {reimport.skipped.length > 0 && <div className="muted" style={{ fontSize: 12 }}>Ficaram de fora: {reimport.skipped.map((s) => `“${s.text}” (${s.reason})`).join('; ')}</div>}
                  <div className="row" style={{ gap: 6 }}>
                    <button className="primary" disabled={!reimport.content.trim()} onClick={() => void doReimport()}>Reimportar</button>
                    <button className="ghost" onClick={() => setReimport({ open: false, content: '', fileName: null, skipped: [] })}>Fechar</button>
                  </div>
                </div>
              )}
              <LyricsPanel studio={studioApi} issues={issues} onReimport={() => setReimport((r) => ({ ...r, open: true }))} />
            </>
          )}
          {tab === 'Visual' && <LyricsProperties studio={studioApi} presets={presets} segmentStartMs={segment.startMs} />}
          {tab === 'Render' && (
            <div style={{ display: 'grid', gap: 10 }}>
              {!state.analysis.ready && <div className="notice">A análise musical precisa terminar antes de renderizar.</div>}
              <div className="card" style={{ display: 'grid', gap: 6 }}>
                <strong>Prévia (rápida, metade da resolução)</strong>
                <button disabled={!state.analysis.ready} onClick={() => void render('preview', variantId, previewRange)}>
                  Trecho {formatMs(previewRange.startMs)}–{formatMs(previewRange.endMs)}{loop ? ' (loop)' : ''}
                </button>
                <button disabled={!state.analysis.ready} onClick={() => void render('preview', variantId, null)}>Música inteira do trecho ({formatMs(durationMs)})</button>
              </div>
              <div className="card" style={{ display: 'grid', gap: 6 }}>
                <strong>Final (MP4 H.264/AAC, resolução cheia)</strong>
                {!state.lyrics.rightsDeclaredAt && <span className="muted" style={{ fontSize: 12 }}>Declare os direitos do áudio e da letra para liberar.</span>}
                {errors.length > 0 && <span className="muted" style={{ fontSize: 12, color: 'var(--accent)' }}>{errors.length} erro(s) na letra impedem o final.</span>}
                {variants.map((v) => (
                  <button key={v.id ?? 'base'} className="primary" disabled={!state.analysis.ready || !state.lyrics.rightsDeclaredAt || errors.length > 0} onClick={() => void render('final', v.id, null)}>
                    Exportar {v.label}
                  </button>
                ))}
                <span className="muted" style={{ fontSize: 12 }}>Render final não publica nada; a aprovação fica na aba Revisão.</span>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <strong>Entregas</strong>
                {deliverables.filter((d) => d.kind === 'PREVIEW' || d.kind === 'FINAL').slice(0, 12).map((d) => {
                  const range = (d.validationJson as { range?: { startFrame: number; endFrame: number } } | null)?.range;
                  return (
                    <div key={d.id} className="card" style={{ fontSize: 13, display: 'grid', gap: 2 }}>
                      <span>
                        <span className="chip" data-tone={d.state === 'READY' ? 'ok' : d.state === 'FAILED' ? 'err' : 'warn'}>{d.state}</span> {d.kind === 'FINAL' ? 'Final' : 'Prévia'} {d.width}×{d.height} · rev {d.revision?.number}
                        {range ? ` · trecho ${formatMs(framesToMs(range.startFrame, fps))}–${formatMs(framesToMs(range.endFrame, fps))}` : ''}
                      </span>
                      <span className="muted">{formatDateTime(d.createdAt)}{d.sha256 ? ` · sha256 ${d.sha256.slice(0, 12)}…` : ''}</span>
                      {d.validationJson?.checks && <span className="muted">QA: {d.validationJson.checks.filter((c) => c.status === 'pass').length}/{d.validationJson.checks.length} ok{d.validationJson.checks.some((c) => c.status === 'fail') ? ` · ${d.validationJson.checks.filter((c) => c.status === 'fail').map((c) => c.message).join('; ')}` : ''}</span>}
                      {d.state === 'READY' && d.storageKey && (
                        <span className="row" style={{ gap: 6 }}>
                          <button className="ghost" onClick={() => { setVariantId(d.variantId ?? null); setView('video'); }}>Ver</button>
                          <a href={`${fileUrl(d.storageKey)}?download=1`}>Baixar MP4</a>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {tab === 'Revisão' && <ReviewPanel studio={reviewStudio} projectId={projectId} channelId={project.channel.id} deliverables={deliverables} reloadDeliverables={loadDeliverables} />}
        </aside>
      </div>
    </div>
  );
}
