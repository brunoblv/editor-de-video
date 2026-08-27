'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PILLARS } from '@editor-video/core/christian';
import { KIND_LABEL, STATUS_LABEL, fileUrl, type ProjectDTO } from '@/lib/dto';

const ACTIVE_STATUSES = new Set(['QUEUED', 'PROCESSING']);

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? 'Falha na requisição.');
  return payload;
}

type ChristianMetadata = {
  pillarLabel?: string;
  arcName?: string;
  episode?: number;
  hook?: string;
  reflection?: string;
  cta?: string;
  verseReference?: string | null;
  verseText?: string | null;
  tags?: string[];
};

export function ChristianEditor({ initialProject }: { initialProject: ProjectDTO }) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isActive = ACTIVE_STATUSES.has(project.status);
  const locked = isActive || busy;
  const ready = project.status === 'READY_FOR_REVIEW' || project.status === 'READY';
  const published = project.status === 'PUBLISHED';

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
          watermark: project.watermark ?? '',
          pillar: project.pillar ?? '',
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

  async function publishYoutube(): Promise<void> {
    await run(async () => {
      await api(`/api/youtube/publish/${project.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privacyStatus: 'private' }),
      });
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

  const meta =
    project.metadataJson && typeof project.metadataJson === 'object'
      ? (project.metadataJson as ChristianMetadata)
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
        {KIND_LABEL[project.kind] ?? project.kind}
        {meta?.pillarLabel ? ` · ${meta.pillarLabel}` : ''}
        {meta?.arcName ? ` · arco "${meta.arcName}"` : ''}
        {meta?.episode ? ` · episódio ${meta.episode}` : ''}
        {' · totalmente automático: só clique em Produzir'}
      </p>

      {project.scheduledAt ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <strong>
            {project.status === 'PUBLISHED' ? 'Agendado no YouTube para' : 'Vai publicar automaticamente às'}
          </strong>{' '}
          {new Date(project.scheduledAt).toLocaleString('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </div>
      ) : null}

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

      {ready || published ? (
        project.outputKey ? (
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
                <div className="row">
                  <a href={fileUrl(project.outputKey, true)} download>
                    <button className="primary" type="button">
                      Baixar MP4
                    </button>
                  </a>
                  {!published ? (
                    <button
                      className="ghost"
                      type="button"
                      disabled={locked}
                      onClick={() => void publishYoutube()}
                    >
                      Publicar no YouTube (privado)
                    </button>
                  ) : project.youtubeVideoId ? (
                    <a
                      href={`https://youtu.be/${project.youtubeVideoId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <button className="ghost" type="button">
                        Ver no YouTube
                      </button>
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null
      ) : null}

      <div className="card">
        <h2>Configuração</h2>
        <div className="grid-2">
          <div>
            <label htmlFor="ch-pillar">Pilar de conteúdo</label>
            <select
              id="ch-pillar"
              value={project.pillar ?? ''}
              disabled={locked}
              onChange={(event) => setProject({ ...project, pillar: event.target.value || null })}
              onBlur={() => void saveMeta()}
            >
              <option value="">Deixar o sistema escolher automaticamente</option>
              {PILLARS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ch-watermark">Marca d&apos;água</label>
            <input
              id="ch-watermark"
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

      {meta?.verseReference ? (
        <div className="card">
          <h2>Versículo</h2>
          <p style={{ fontStyle: 'italic' }}>&ldquo;{meta.verseText}&rdquo;</p>
          <p className="muted">{meta.verseReference}</p>
        </div>
      ) : null}

      {meta?.hook || meta?.reflection ? (
        <div className="card">
          <h2>Roteiro</h2>
          {meta.hook ? (
            <p>
              <strong>Hook:</strong> {meta.hook}
            </p>
          ) : null}
          {meta.reflection ? <p className="muted">{meta.reflection}</p> : null}
          {meta.cta ? (
            <p>
              <strong>CTA:</strong> {meta.cta}
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
        <button className="primary" type="button" disabled={locked} onClick={() => void produce()}>
          {ready || published ? 'Produzir novamente' : 'Produzir vídeo'}
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
