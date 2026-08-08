'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KIND_LABEL, STATUS_LABEL, fileUrl, type ProjectDTO } from '@/lib/dto';

const ACTIVE_STATUSES = new Set(['QUEUED', 'PROCESSING']);

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? 'Falha na requisição.');
  return payload;
}

export function AmbientEditor({ initialProject }: { initialProject: ProjectDTO }) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [metaTags, setMetaTags] = useState('');

  const isActive = ACTIVE_STATUSES.has(project.status);
  const waitingPreview = project.status === 'WAITING_PREVIEW_APPROVAL';
  const ready =
    project.status === 'READY_FOR_REVIEW' ||
    project.status === 'READY' ||
    project.status === 'PUBLISHED';

  const refresh = useCallback(async () => {
    const data = await api<{ project: ProjectDTO }>(`/api/projects/${project.id}`);
    setProject(data.project);
    return data.project;
  }, [project.id]);

  useEffect(() => {
    const metadata =
      project.metadataJson && typeof project.metadataJson === 'object'
        ? (project.metadataJson as {
            title?: string;
            description?: string;
            tags?: string[];
          })
        : null;
    setMetaTitle(metadata?.title ?? project.title);
    setMetaDescription(metadata?.description ?? '');
    setMetaTags((metadata?.tags ?? []).join(', '));
  }, [project.id, project.metadataJson, project.title]);

  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => {
      void refresh().catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [isActive, refresh]);

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    } finally {
      setBusy(false);
    }
  }

  async function enqueue(mode: string): Promise<void> {
    await run(async () => {
      await api(`/api/ambient/${project.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
    });
  }

  async function savePackaging(): Promise<void> {
    await run(async () => {
      await api(`/api/ambient/${project.id}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: metaTitle,
          description: metaDescription,
          tags: metaTags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
    });
  }

  async function publishYoutube(asShort = false): Promise<void> {
    await run(async () => {
      await api(`/api/youtube/publish/${project.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privacyStatus: 'private', asShort }),
      });
    });
  }

  async function removeProject(): Promise<void> {
    if (!window.confirm('Apagar este projeto ambient e todos os arquivos?')) return;
    await run(async () => {
      await api(`/api/projects/${project.id}`, { method: 'DELETE' });
      router.push('/ambient');
    });
  }

  const quality =
    project.qualityJson && typeof project.qualityJson === 'object'
      ? (project.qualityJson as Record<string, number | boolean | string[]>)
      : null;

  const metadata =
    project.metadataJson && typeof project.metadataJson === 'object'
      ? (project.metadataJson as {
          title?: string;
          description?: string;
          tags?: string[];
          playlists?: string[];
          youtubeUrl?: string;
        })
      : null;

  const layers =
    project.audioTimelineJson &&
    typeof project.audioTimelineJson === 'object' &&
    Array.isArray((project.audioTimelineJson as { layers?: unknown }).layers)
      ? (
          (project.audioTimelineJson as {
            layers: Array<{ kind: string; volume: number; source: string }>;
          }).layers
        )
      : [];

  return (
    <main>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>{project.title}</h1>
        <span className="badge" data-status={project.status}>
          {STATUS_LABEL[project.status] ?? project.status}
        </span>
      </div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 24 }}>
        {KIND_LABEL[project.kind]} · {project.universe ?? project.environment} ·{' '}
        {project.variationId ?? project.weather} · {project.durationMinutes} min · seed{' '}
        {project.seed}
        {project.recipeId ? ` · ${project.recipeId}` : ''}
        {project.qualityScore != null ? ` · score ${Math.round(project.qualityScore)}` : ''}
      </p>

      {error ? <div className="error">{error}</div> : null}
      {project.status === 'FAILED' && project.errorMessage ? (
        <div className="error">Produção falhou: {project.errorMessage}</div>
      ) : null}

      {isActive ? (
        <div className="card">
          <h2>{project.stage ?? 'Processando'}</h2>
          <div className="progress">
            <div style={{ width: `${project.progress}%` }} />
          </div>
          <div className="muted">{project.progress}%</div>
        </div>
      ) : null}

      {waitingPreview && project.previewKey ? (
        <div className="card">
          <h2>Preview</h2>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <video className="preview" src={fileUrl(project.previewKey)} controls playsInline />
            <div>
              <p className="muted" style={{ marginTop: 0 }}>
                Preview de ~60s · aprove antes do render longo
              </p>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <button
                  className="primary"
                  type="button"
                  disabled={busy}
                  onClick={() => void enqueue('render')}
                >
                  APROVAR
                </button>
                <button type="button" disabled={busy} onClick={() => void enqueue('regenerate_audio')}>
                  REGERAR ÁUDIO
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void enqueue('regenerate_visual')}
                >
                  REGERAR VISUAL
                </button>
                <button type="button" disabled={busy} onClick={() => void enqueue('regenerate_all')}>
                  REGERAR TUDO
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {ready && project.outputKey ? (
        <div className="card">
          <h2>Revisão</h2>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <video className="preview" src={fileUrl(project.outputKey)} controls playsInline />
            <div>
              <p className="muted" style={{ marginTop: 0 }}>
                {project.outputSizeByte
                  ? `${(project.outputSizeByte / 1024 / 1024).toFixed(1)} MB`
                  : ''}{' '}
                · {project.durationMinutes} min
                {project.youtubeVideoId ? (
                  <>
                    {' · '}
                    <a
                      href={`https://youtu.be/${project.youtubeVideoId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      YouTube
                    </a>
                  </>
                ) : null}
              </p>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <a href={fileUrl(project.outputKey, true)} download>
                  <button className="primary" type="button">
                    Baixar MP4
                  </button>
                </a>
                {project.status === 'READY_FOR_REVIEW' || project.status === 'PUBLISHED' ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void publishYoutube(false)}
                    >
                      Publicar no YouTube
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void enqueue('generate_short')}
                    >
                      Gerar Short
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {quality ? (
        <div className="card">
          <h2>Quality Check</h2>
          <div className="grid-2">
            <div>Audio Quality: {String(quality.audioQuality)}</div>
            <div>Loop Quality: {String(quality.loopQuality)}</div>
            <div>Atmosphere: {String(quality.atmosphere)}</div>
            <div>Visual Quality: {String(quality.visualQuality)}</div>
            <div>License Safety: {String(quality.licenseSafety)}</div>
            <div>
              <strong>TOTAL: {String(quality.total)}</strong>
              {quality.passed === false ? ' · bloqueia publish' : ''}
            </div>
          </div>
          {Array.isArray(quality.notes) && quality.notes.length > 0 ? (
            <ul className="muted">
              {quality.notes.map((note) => (
                <li key={String(note)}>{String(note)}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {layers.length > 0 ? (
        <div className="card">
          <h2>Soundscape</h2>
          <ul>
            {layers.map((layer) => (
              <li key={layer.kind}>
                {layer.kind.replace(/_/g, ' ')} — {Math.round(layer.volume * 100)}% ({layer.source})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="card">
        <h2>Packaging YouTube</h2>
        <label style={{ display: 'block', marginBottom: 12 }}>
          Título
          <input
            value={metaTitle}
            onChange={(e) => setMetaTitle(e.target.value)}
            style={{ width: '100%', marginTop: 6 }}
            maxLength={100}
          />
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>
          Descrição
          <textarea
            value={metaDescription}
            onChange={(e) => setMetaDescription(e.target.value)}
            rows={10}
            style={{ width: '100%', marginTop: 6, fontFamily: 'inherit' }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>
          Tags (vírgula)
          <input
            value={metaTags}
            onChange={(e) => setMetaTags(e.target.value)}
            style={{ width: '100%', marginTop: 6 }}
          />
        </label>
        {metadata?.playlists?.length ? (
          <p className="muted">Playlists: {metadata.playlists.join(', ')}</p>
        ) : null}
        <button type="button" disabled={busy} onClick={() => void savePackaging()}>
          Salvar packaging
        </button>
      </div>

      <div className="card">
        <h2>Ações</h2>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {project.status === 'DRAFT' || project.status === 'FAILED' ? (
            <button
              className="primary"
              type="button"
              disabled={busy}
              onClick={() => void enqueue('preview')}
            >
              Gerar preview
            </button>
          ) : null}
          <a href="/ambient/youtube" className="muted">
            YouTube settings
          </a>
          <button type="button" className="danger" disabled={busy} onClick={() => void removeProject()}>
            Apagar
          </button>
          <a href="/ambient" className="muted">
            ← Voltar
          </a>
        </div>
      </div>
    </main>
  );
}
