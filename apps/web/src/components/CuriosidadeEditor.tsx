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

export function CuriosidadeEditor({ initialProject }: { initialProject: ProjectDTO }) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isActive = ACTIVE_STATUSES.has(project.status);
  const locked = isActive || busy;
  const ready = project.status === 'READY_FOR_REVIEW' || project.status === 'READY';

  const refresh = useCallback(async () => {
    const data = await api<{ project: ProjectDTO }>(`/api/projects/${project.id}`);
    setProject(data.project);
    return data.project;
  }, [project.id]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    } finally {
      setBusy(false);
    }
  }

  async function saveMeta(): Promise<void> {
    await run(async () => {
      await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: project.title,
          watermark: project.watermark ?? '',
          topic: project.topic ?? '',
        }),
      });
    });
  }

  async function produce(): Promise<void> {
    await run(async () => {
      await api(`/api/projects/${project.id}/render`, { method: 'POST' });
      await refresh();
    });
  }

  async function removeProject(): Promise<void> {
    if (!window.confirm('Apagar este projeto e todos os arquivos dele?')) return;
    await run(async () => {
      await api(`/api/projects/${project.id}`, { method: 'DELETE' });
      router.push('/');
    });
  }

  const script =
    project.scriptJson && typeof project.scriptJson === 'object'
      ? (project.scriptJson as {
          hook?: string;
          narration?: string;
          cta?: string;
        })
      : null;

  return (
    <main>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>{project.title}</h1>
        <span className="badge" data-status={project.status}>
          {STATUS_LABEL[project.status] ?? project.status}
        </span>
      </div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 24 }}>
        {KIND_LABEL[project.kind] ?? project.kind} · tema → roteiro → mídia → narração → vídeo
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
                · 1080×1920 · {STATUS_LABEL[project.status]}
              </p>
              <a href={fileUrl(project.outputKey, true)} download>
                <button className="primary" type="button">
                  Baixar MP4
                </button>
              </a>
            </div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <h2>Configuração</h2>
        <div className="grid-2">
          <div>
            <label htmlFor="c-topic">Tema</label>
            <input
              id="c-topic"
              type="text"
              value={project.topic ?? ''}
              maxLength={160}
              disabled={locked}
              onChange={(event) => setProject({ ...project, topic: event.target.value })}
              onBlur={() => void saveMeta()}
            />
          </div>
          <div>
            <label htmlFor="c-watermark">Marca d&apos;água</label>
            <input
              id="c-watermark"
              type="text"
              value={project.watermark ?? ''}
              maxLength={40}
              disabled={locked}
              onChange={(event) => setProject({ ...project, watermark: event.target.value })}
              onBlur={() => void saveMeta()}
            />
          </div>
        </div>
      </div>

      {script ? (
        <div className="card">
          <h2>Roteiro</h2>
          {script.hook ? (
            <p>
              <strong>Hook:</strong> {script.hook}
            </p>
          ) : null}
          {script.narration ? <p className="muted">{script.narration}</p> : null}
          {script.cta ? (
            <p>
              <strong>CTA:</strong> {script.cta}
            </p>
          ) : null}
        </div>
      ) : null}

      {project.mediaAssets.length > 0 ? (
        <div className="card">
          <h2>Fontes de mídia</h2>
          {project.mediaAssets.map((asset) => (
            <div key={asset.id} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600 }}>
                {asset.query}{' '}
                <span className="muted">
                  · {asset.provider}
                  {asset.author ? ` · ${asset.author}` : ''}
                </span>
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {asset.license ?? 'licença registrada'} ·{' '}
                <a href={asset.sourceUrl} target="_blank" rel="noreferrer">
                  origem
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 24, justifyContent: 'space-between' }}>
        <button
          className="primary"
          type="button"
          disabled={locked || !(project.topic ?? '').trim()}
          onClick={() => void produce()}
        >
          {ready ? 'Produzir novamente' : 'Produzir vídeo'}
        </button>
        <button
          className="ghost danger"
          type="button"
          disabled={locked}
          onClick={() => void removeProject()}
        >
          Apagar projeto
        </button>
      </div>
    </main>
  );
}
