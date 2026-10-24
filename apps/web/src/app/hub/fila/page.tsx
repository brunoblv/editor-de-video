'use client';

import { useEffect, useState } from 'react';
import { api, describeError, formatDateTime, useApi } from '@/components/hub/api';

type Job = {
  id: string;
  kind: string;
  queue: string;
  state: string;
  progress: number;
  stage: string | null;
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  errorCategory: string | null;
  heartbeatAt: string | null;
  createdAt: string;
  project: { id: string; title: string; channel: { name: string } };
};

const STALE_MS = 90_000;

export default function QueuePage() {
  const { data, error, loading, reload } = useApi<{ jobs: Job[] }>('/api/v3/jobs');
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const t = setInterval(() => void reload(), 4000);
    return () => clearInterval(t);
  }, [reload]);

  const act = async (job: Job, action: 'cancel' | 'retry') => {
    if (action === 'cancel' && !window.confirm('Cancelar este job? Os arquivos válidos já gerados são preservados.')) return;
    try {
      await api(`/api/v3/jobs/${job.id}/${action}`, { method: 'POST' });
      setMessage({ tone: 'ok', text: action === 'cancel' ? 'Cancelamento solicitado.' : 'Job reenfileirado; etapas concluídas serão reaproveitadas.' });
      await reload();
    } catch (err) {
      setMessage({ tone: 'err', text: describeError(err) });
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1>Fila</h1>
      {message && <div className="notice" data-tone={message.tone} role="status">{message.text}</div>}
      {loading && !data && <div className="state" role="status">Carregando fila…</div>}
      {error && <div className="notice" data-tone="err" role="alert">{error}</div>}
      {data && data.jobs.length === 0 && <div className="state">Nenhum job ainda. Prévias e renders aparecem aqui.</div>}
      {data && data.jobs.length > 0 && (
        <table className="card">
          <thead><tr><th>Projeto</th><th>Tipo / fila</th><th>Estado</th><th>Etapa</th><th>Criado</th><th /></tr></thead>
          <tbody>
            {data.jobs.map((j) => {
              const offline = (j.state === 'RUNNING' || j.state === 'CANCEL_REQUESTED') && (!j.heartbeatAt || Date.now() - new Date(j.heartbeatAt).getTime() > STALE_MS);
              return (
                <tr key={j.id}>
                  <td><a href={`/hub/projetos/${j.project.id}`}>{j.project.title}</a><div className="stat">{j.project.channel.name}</div></td>
                  <td>{j.kind}<div className="stat">{j.queue}</div></td>
                  <td>
                    <span className="chip" data-tone={j.state === 'SUCCEEDED' ? 'ok' : j.state === 'FAILED' ? 'err' : 'warn'}>{j.state}</span>
                    {offline && <div className="notice" data-tone="err" style={{ marginTop: 4 }}>Worker sem sinal</div>}
                  </td>
                  <td>
                    {j.state === 'RUNNING' && <progress value={j.progress} max={1} aria-label="Progresso" />} {j.stage ?? ''}
                    {j.errorMessage && <div className="stat">{j.errorCategory}: {j.errorMessage.slice(0, 200)}</div>}
                    <div className="stat">Tentativa {j.attempts}/{j.maxAttempts}</div>
                  </td>
                  <td>{formatDateTime(j.createdAt)}</td>
                  <td>
                    {['QUEUED', 'RUNNING'].includes(j.state) && <button onClick={() => void act(j, 'cancel')}>Cancelar</button>}
                    {['FAILED', 'CANCELLED'].includes(j.state) && j.attempts < j.maxAttempts && <button onClick={() => void act(j, 'retry')}>Repetir</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
