'use client';

import { useState } from 'react';
import { api, describeError, formatDateTime, useApi, useSelectedChannel } from '@/components/hub/api';

type Project = { id: string; title: string; state: string; formats: string[]; updatedAt: string; legacyReadOnly: boolean; channel: { id: string; name: string } };
type Channel = { id: string; name: string; series: Array<{ id: string; name: string }> };

const FORMATS = ['16:9', '9:16', '1:1', '4:5'] as const;

export default function ProjectsPage() {
  const [channel] = useSelectedChannel();
  const projects = useApi<{ projects: Project[] }>(`/api/v3/projects${channel ? `?channelId=${channel}` : ''}`);
  const channels = useApi<{ channels: Channel[] }>('/api/v3/channels');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ channelId: '', seriesId: '', title: '', briefing: '', objective: '', targetDurationSec: '', formats: ['16:9'] as string[] });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedChannel = channels.data?.channels.find((c) => c.id === (form.channelId || channel));

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { project } = await api<{ project: { id: string } }>('/api/v3/projects', {
        method: 'POST',
        json: {
          channelId: form.channelId || channel,
          seriesId: form.seriesId || null,
          title: form.title,
          briefing: form.briefing || null,
          objective: form.objective || null,
          targetDurationSec: form.targetDurationSec ? Number(form.targetDurationSec) : null,
          formats: form.formats,
        },
      });
      window.location.href = `/hub/projetos/${project.id}`;
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Projetos</h1>
        <button className="primary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>Novo projeto</button>
      </div>

      {open && (
        <section className="card" style={{ display: 'grid', gap: 10 }} aria-label="Novo projeto">
          <label className="field">
            <span>Canal</span>
            <select value={form.channelId || channel} onChange={(e) => setForm({ ...form, channelId: e.target.value, seriesId: '' })}>
              <option value="">Selecione…</option>
              {channels.data?.channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          {selectedChannel && selectedChannel.series.length > 0 && (
            <label className="field">
              <span>Série (opcional)</span>
              <select value={form.seriesId} onChange={(e) => setForm({ ...form, seriesId: e.target.value })}>
                <option value="">—</option>
                {selectedChannel.series.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
          <label className="field"><span>Título</span><input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label className="field"><span>Briefing ou roteiro</span><textarea rows={5} value={form.briefing} onChange={(e) => setForm({ ...form, briefing: e.target.value })} /></label>
          <div className="grid-2">
            <label className="field"><span>Objetivo</span><input type="text" value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} /></label>
            <label className="field"><span>Duração alvo (s)</span><input type="number" min={1} value={form.targetDurationSec} onChange={(e) => setForm({ ...form, targetDurationSec: e.target.value })} /></label>
          </div>
          <fieldset style={{ border: 'none', padding: 0 }}>
            <legend className="muted">Formatos (o primeiro é o principal; os demais viram variantes com enquadramento próprio)</legend>
            <div className="row" style={{ gap: 12 }}>
              {FORMATS.map((f) => (
                <label key={f} className="row" style={{ gap: 4 }}>
                  <input
                    type="checkbox"
                    checked={form.formats.includes(f)}
                    onChange={(e) => setForm({ ...form, formats: e.target.checked ? [...form.formats, f] : form.formats.filter((x) => x !== f) })}
                  />
                  {f}
                </label>
              ))}
            </div>
          </fieldset>
          {error && <div className="notice" data-tone="err" role="alert">{error}</div>}
          <div><button className="primary" disabled={busy || !form.title || !(form.channelId || channel) || form.formats.length === 0} onClick={() => void create()}>{busy ? 'Criando…' : 'Criar e abrir estúdio'}</button></div>
        </section>
      )}

      {projects.loading && !projects.data && <div className="state" role="status">Carregando projetos…</div>}
      {projects.error && <div className="notice" data-tone="err" role="alert">{projects.error}</div>}
      {projects.data && projects.data.projects.length === 0 && <div className="state">Nenhum projeto{channel ? ' neste canal' : ''}. Use “Novo projeto” para começar por briefing, roteiro ou arquivos.</div>}
      {projects.data && projects.data.projects.length > 0 && (
        <table className="card">
          <thead><tr><th>Projeto</th><th>Canal</th><th>Estado</th><th>Formatos</th><th>Atualizado</th></tr></thead>
          <tbody>
            {projects.data.projects.map((p) => (
              <tr key={p.id}>
                <td><a href={`/hub/projetos/${p.id}`}>{p.title}</a> {p.legacyReadOnly && <span className="chip">legado · leitura</span>}</td>
                <td>{p.channel.name}</td>
                <td><span className="chip">{p.state}</span></td>
                <td>{p.formats.join(', ')}</td>
                <td>{formatDateTime(p.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
