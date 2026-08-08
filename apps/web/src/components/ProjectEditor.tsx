'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { STATUS_LABEL, fileUrl, type ClipDTO, type ProjectDTO } from '@/lib/dto';

export interface Limits {
  minClips: number;
  maxClips: number;
  maxSizeMb: number;
  maxDurationSec: number;
}

const ACTIVE_STATUSES = new Set(['QUEUED', 'PROCESSING']);

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? 'Falha na requisição.');
  return payload;
}

/** Lê a duração do arquivo no browser para barrar clipes longos antes do upload. */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });
}

export function ProjectEditor({
  initialProject,
  limits,
}: {
  initialProject: ProjectDTO;
  limits: Limits;
}) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isActive = ACTIVE_STATUSES.has(project.status);
  const locked = isActive || busy;

  const refresh = useCallback(async () => {
    const data = await api<{ project: ProjectDTO }>(`/api/projects/${project.id}`);
    setProject(data.project);
    return data.project;
  }, [project.id]);

  // Enquanto o worker processa, o servidor é a fonte da verdade do progresso.
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

  async function upload(files: FileList | File[]): Promise<void> {
    const list = Array.from(files);
    if (list.length === 0) return;

    await run(async () => {
      for (const file of list) {
        const duration = await readDuration(file);
        if (duration !== null && duration > limits.maxDurationSec) {
          throw new Error(
            `"${file.name}" tem ${duration.toFixed(0)}s; o limite é ${limits.maxDurationSec}s.`,
          );
        }
      }

      const form = new FormData();
      for (const file of list) form.append('files', file);

      await api(`/api/projects/${project.id}/clips`, { method: 'POST', body: form });
      await refresh();
    });
  }

  function move(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= project.clips.length) return;

    const order = project.clips.map((clip) => clip.id);
    const [moved] = order.splice(index, 1);
    if (!moved) return;
    order.splice(target, 0, moved);

    // Otimista: reordena localmente e confirma no servidor em seguida.
    const reordered = order
      .map((id) => project.clips.find((clip) => clip.id === id))
      .filter((clip): clip is ClipDTO => clip !== undefined)
      .map((clip, position) => ({ ...clip, position }));
    setProject({ ...project, clips: reordered });

    void run(async () => {
      await api(`/api/projects/${project.id}/clips/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      });
      await refresh();
    });
  }

  function patchClip(
    id: string,
    data: Partial<Pick<ClipDTO, 'label' | 'maxDurationSec' | 'transcribe'>>,
  ): void {
    setProject((current) => ({
      ...current,
      clips: current.clips.map((clip) => (clip.id === id ? { ...clip, ...data } : clip)),
    }));
  }

  async function saveClip(clip: ClipDTO): Promise<void> {
    await run(async () => {
      await api(`/api/clips/${clip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: clip.label ?? '',
          maxDurationSec: clip.maxDurationSec,
          transcribe: clip.transcribe,
        }),
      });
    });
  }

  async function toggleTranscribe(clip: ClipDTO, transcribe: boolean): Promise<void> {
    patchClip(clip.id, { transcribe });
    await run(async () => {
      await api(`/api/clips/${clip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcribe }),
      });
    });
  }

  async function removeClip(id: string): Promise<void> {
    await run(async () => {
      await api(`/api/clips/${id}`, { method: 'DELETE' });
      await refresh();
    });
  }

  async function saveProject(): Promise<void> {
    await run(async () => {
      await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: project.title, watermark: project.watermark ?? '' }),
      });
    });
  }

  async function startRender(): Promise<void> {
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

  const canRender = project.clips.length >= limits.minClips && !locked;
  const full = project.clips.length >= limits.maxClips;

  return (
    <main>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>{project.title}</h1>
        <span className="badge" data-status={project.status}>
          {STATUS_LABEL[project.status] ?? project.status}
        </span>
      </div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 24 }}>
        {project.clips.length} de {limits.maxClips} clipes · mínimo {limits.minClips} para renderizar
      </p>

      {error ? <div className="error">{error}</div> : null}
      {project.status === 'FAILED' && project.errorMessage ? (
        <div className="error">Render falhou: {project.errorMessage}</div>
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

      {project.status === 'READY' && project.outputKey ? (
        <div className="card">
          <h2>Resultado</h2>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <video className="preview" src={fileUrl(project.outputKey)} controls playsInline />
            <div>
              <p className="muted" style={{ marginTop: 0 }}>
                {project.outputSizeByte
                  ? `${(project.outputSizeByte / 1024 / 1024).toFixed(1)} MB`
                  : ''}{' '}
                · 1080×1920
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
            <label htmlFor="p-title">Título</label>
            <input
              id="p-title"
              type="text"
              value={project.title}
              maxLength={80}
              disabled={locked}
              onChange={(event) => setProject({ ...project, title: event.target.value })}
              onBlur={() => void saveProject()}
            />
          </div>
          <div>
            <label htmlFor="p-watermark">Marca d&apos;água</label>
            <input
              id="p-watermark"
              type="text"
              value={project.watermark ?? ''}
              maxLength={40}
              disabled={locked}
              onChange={(event) => setProject({ ...project, watermark: event.target.value })}
              onBlur={() => void saveProject()}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Clipes</h2>

        {project.clips.map((clip, index) => (
          <div className="clip" key={clip.id}>
            <div className="rank">#{project.clips.length - index}</div>

            <div className="body">
              <div className="name" title={clip.originalName}>
                {clip.originalName}
              </div>
              <div className="grid-2">
                <div>
                  <label htmlFor={`label-${clip.id}`}>Texto sobre o clipe</label>
                  <input
                    id={`label-${clip.id}`}
                    type="text"
                    value={clip.label ?? ''}
                    maxLength={140}
                    disabled={locked}
                    placeholder="opcional"
                    onChange={(event) => patchClip(clip.id, { label: event.target.value })}
                    onBlur={() => void saveClip(clip)}
                  />
                </div>
                <div>
                  <label htmlFor={`dur-${clip.id}`}>Duração máx. (s)</label>
                  <input
                    id={`dur-${clip.id}`}
                    type="number"
                    min={1}
                    max={limits.maxDurationSec}
                    value={clip.maxDurationSec}
                    disabled={locked}
                    onChange={(event) =>
                      patchClip(clip.id, { maxDurationSec: Number(event.target.value) })
                    }
                    onBlur={() => void saveClip(clip)}
                  />
                </div>
              </div>
              <label
                htmlFor={`transcribe-${clip.id}`}
                className="row"
                style={{ marginTop: 12, gap: 8, cursor: locked ? 'default' : 'pointer' }}
              >
                <input
                  id={`transcribe-${clip.id}`}
                  type="checkbox"
                  checked={clip.transcribe}
                  disabled={locked}
                  onChange={(event) => void toggleTranscribe(clip, event.target.checked)}
                />
                <span>Legendas automáticas (Whisper)</span>
              </label>
              <div className="muted" style={{ marginTop: 8 }}>
                {(clip.sizeByte / 1024 / 1024).toFixed(1)} MB
                {clip.sourceDurationSec ? ` · original ${clip.sourceDurationSec.toFixed(1)}s` : ''}
              </div>
            </div>

            <div className="controls">
              <button
                type="button"
                className="ghost"
                disabled={locked || index === 0}
                onClick={() => move(index, -1)}
                aria-label="Mover para cima"
              >
                ↑
              </button>
              <button
                type="button"
                className="ghost"
                disabled={locked || index === project.clips.length - 1}
                onClick={() => move(index, 1)}
                aria-label="Mover para baixo"
              >
                ↓
              </button>
              <button
                type="button"
                className="ghost danger"
                disabled={locked}
                onClick={() => void removeClip(clip.id)}
                aria-label="Remover clipe"
              >
                ✕
              </button>
            </div>
          </div>
        ))}

        {full ? (
          <div className="muted" style={{ padding: '12px 0' }}>
            Limite de {limits.maxClips} clipes atingido.
          </div>
        ) : (
          <div
            className="dropzone"
            data-active={dragging}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!locked) void upload(event.dataTransfer.files);
            }}
          >
            {busy ? 'Enviando...' : 'Arraste os vídeos aqui ou clique para escolher'}
            <div style={{ fontSize: 13, marginTop: 6 }}>
              até {limits.maxSizeMb} MB e {limits.maxDurationSec}s por clipe
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          multiple
          hidden
          disabled={locked}
          onChange={(event) => {
            if (event.target.files) void upload(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      <div className="row" style={{ marginTop: 24, justifyContent: 'space-between' }}>
        <button className="primary" type="button" disabled={!canRender} onClick={() => void startRender()}>
          {project.status === 'READY' ? 'Renderizar novamente' : 'Gerar vídeo'}
        </button>
        <button className="ghost danger" type="button" disabled={locked} onClick={() => void removeProject()}>
          Apagar projeto
        </button>
      </div>
    </main>
  );
}
