'use client';

import { useRef, useState } from 'react';
import { describeError, formatDuration, HubApiError, useApi } from '@/components/hub/api';

type Asset = { id: string; kind: string; status: string; originalName: string; sha256: string | null; sizeBytes: string | null; durationSec: number | null; width: number | null; height: number | null; license: string | null; licenseVerdict: string; provider: string | null; tags: string[]; createdAt: string };

export default function LibraryPage() {
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const { data, error, loading, reload } = useApi<{ assets: Asset[] }>(`/api/v3/assets?${new URLSearchParams({ ...(kind ? { kind } : {}), ...(q ? { q } : {}) })}`);
  const [uploads, setUploads] = useState<Array<{ name: string; status: string; tone: 'ok' | 'err' | 'warn' }>>([]);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList) => {
    for (const file of Array.from(files)) {
      setUploads((u) => [...u, { name: file.name, status: 'Enviando…', tone: 'warn' }]);
      const set = (status: string, tone: 'ok' | 'err' | 'warn') => setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, status, tone } : x)));
      try {
        const res = await fetch(`/api/v3/assets/uploads?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file, headers: { 'content-type': file.type || 'application/octet-stream' } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new HubApiError(data.error ?? `Erro ${res.status}`, res.status, data.code ?? 'INTERNAL', data);
        set(data.jobId ? 'Enviado — análise e proxy na fila' : 'Enviado (já existia: mesmo hash)', 'ok');
        await reload();
      } catch (err) {
        set(`Upload interrompido: ${describeError(err)} — selecione o arquivo de novo para retomar.`, 'err');
      }
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1>Biblioteca</h1>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {['VIDEO', 'AUDIO', 'IMAGE', 'FONT', 'CHARACTER'].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <input type="text" placeholder="Buscar por nome ou tag" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        <button className="primary" onClick={() => input.current?.click()}>Enviar arquivos</button>
        <input ref={input} type="file" multiple hidden onChange={(e) => e.target.files && void upload(e.target.files)} />
      </div>
      {uploads.map((u) => <div key={u.name} className="notice" data-tone={u.tone} role="status">{u.name}: {u.status}</div>)}
      {loading && !data && <div className="state" role="status">Carregando biblioteca…</div>}
      {error && <div className="notice" data-tone="err" role="alert">{error}</div>}
      {data && data.assets.length === 0 && <div className="state">Biblioteca vazia. Envie vídeos, áudios, imagens ou fontes.</div>}
      {data && data.assets.length > 0 && (
        <table className="card">
          <thead><tr><th>Arquivo</th><th>Tipo</th><th>Duração</th><th>Resolução</th><th>Licença</th><th>Hash</th><th>Estado</th></tr></thead>
          <tbody>
            {data.assets.map((a) => (
              <tr key={a.id}>
                <td>{a.originalName}<div className="stat">{a.provider ?? 'upload'}{a.tags.length ? ` · ${a.tags.join(', ')}` : ''}</div></td>
                <td>{a.kind}</td>
                <td>{formatDuration(a.durationSec)}</td>
                <td>{a.width ? `${a.width}×${a.height}` : '—'}</td>
                <td>{a.license ?? '—'} <span className="chip" data-tone={a.licenseVerdict === 'SAFE' ? 'ok' : a.licenseVerdict === 'REJECTED' ? 'err' : 'warn'}>{a.licenseVerdict}</span></td>
                <td title={a.sha256 ?? ''} style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.sha256?.slice(0, 10) ?? '—'}</td>
                <td><span className="chip" data-tone={a.status === 'READY' ? 'ok' : a.status === 'MISSING' || a.status === 'FAILED' ? 'err' : 'warn'}>{a.status === 'MISSING' ? 'arquivo ausente' : a.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
