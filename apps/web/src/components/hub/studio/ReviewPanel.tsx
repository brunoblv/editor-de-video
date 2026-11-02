'use client';

import { useState } from 'react';
import { diffRevisions, type TimelineDocument } from '@editor-video/timeline';
import { api, describeError, formatDateTime, useApi } from '../api';
import { fileUrl, type Deliverable, type StudioApi } from './types';

type Revision = { id: string; number: number; authorType: string; command: string | null; summary: string | null; restoredFromRevisionId: string | null; editorialHash: string; createdAt: string };
type Account = { id: string; platform: string; displayName: string | null; status: string; isTestAccount: boolean };

/**
 * Revisão (§14.3): histórico com comparação/restauração, entregas com
 * hash e pendências técnicas, aprovação vinculada à entrega + metadados.
 * Prévia não equivale a entrega final aprovada.
 */
export function ReviewPanel({ studio, projectId, channelId, deliverables, reloadDeliverables }: { studio: StudioApi; projectId: string; channelId: string; deliverables: Deliverable[]; reloadDeliverables: () => Promise<void> }) {
  const history = useApi<{ revisions: Revision[] }>(`/api/v3/projects/${projectId}/revisions?r=${studio.doc.revisionId}`);
  const channel = useApi<{ channel: { accounts: Account[] } }>(`/api/v3/channels/${channelId}`);
  const [compare, setCompare] = useState<{ number: number; changes: string[] } | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [approval, setApproval] = useState<{ deliverableId: string; accountId: string; title: string; description: string; privacy: 'private' | 'unlisted' | 'public' } | null>(null);

  const doCompare = async (rev: Revision) => {
    const { document } = await api<{ document: TimelineDocument }>(`/api/v3/projects/${projectId}/revisions?revisionId=${rev.id}`);
    const changes = diffRevisions(document, studio.doc).map((c) => ('itemId' in c ? `${c.type} ${c.itemId}${c.type === 'modified' ? ` (${c.fields.join(', ')})` : ''}` : c.type === 'variant' ? `variante ${c.variantId}` : `trilha ${c.trackId}`));
    setCompare({ number: rev.number, changes });
  };
  const restore = async (rev: Revision) => {
    if (!window.confirm(`Restaurar a revisão ${rev.number}? Uma nova revisão será criada; o histórico é preservado.`)) return;
    try {
      await api(`/api/v3/projects/${projectId}/revisions`, { method: 'POST', json: { restoreRevisionId: rev.id, expectedRevisionId: studio.doc.revisionId } });
      await studio.reload();
      await history.reload();
    } catch (err) {
      setMessage({ tone: 'err', text: describeError(err) });
    }
  };
  const approve = async () => {
    if (!approval) return;
    try {
      const metadata = { title: approval.title, description: approval.description, privacy: approval.privacy };
      await api(`/api/v3/deliverables/${approval.deliverableId}/approvals`, { method: 'POST', json: { socialAccountId: approval.accountId, metadata, decision: 'APPROVED' } });
      await api('/api/v3/publications', { method: 'POST', json: { deliverableId: approval.deliverableId, socialAccountId: approval.accountId, metadata } });
      setMessage({ tone: 'ok', text: 'Aprovado para esta conta e estes metadados. Agende no Calendário; qualquer mudança exige nova aprovação.' });
      setApproval(null);
      await reloadDeliverables();
    } catch (err) {
      setMessage({ tone: 'err', text: describeError(err) });
    }
  };

  const finals = deliverables.filter((d) => d.kind === 'FINAL' || d.kind === 'RESOLVE_PACKAGE');
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {message && <div className="notice" data-tone={message.tone} role="status">{message.text}</div>}
      <section>
        <h3 style={{ margin: '4px 0' }}>Entregas</h3>
        {finals.length === 0 && <div className="state">Nenhuma entrega final. Gere com “Exportar”.</div>}
        {finals.map((d) => {
          const checks = d.validationJson?.checks ?? [];
          const issues = checks.filter((c) => c.status === 'fail' || c.status === 'warn');
          const current = d.revisionId === studio.doc.revisionId;
          return (
            <div key={d.id} className="card" style={{ padding: 8 }}>
              <div><strong>{d.kind === 'FINAL' ? 'Final' : 'Pacote Resolve'}</strong> · rev {d.revision?.number ?? '?'} · {d.variantId ?? 'principal'} <span className="chip" data-tone={d.state === 'READY' ? 'ok' : d.state === 'FAILED' ? 'err' : 'warn'}>{d.state}</span></div>
              {!current && <div className="stat">De revisão anterior à exibida.</div>}
              {d.sha256 && <div className="stat" style={{ fontFamily: 'monospace' }}>sha256 {d.sha256.slice(0, 16)}…</div>}
              {issues.map((c) => <div key={c.id} className="stat">⚠ {c.id}: {c.message}</div>)}
              {d.validationJson?.limitations?.slice(0, 5).map((l, i) => <div key={i} className="stat">Achatado: {l.itemId} ({l.kind})</div>)}
              <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                {d.storageKey && d.kind === 'FINAL' && <a href={`${fileUrl(d.storageKey)}?download=1`}>Baixar MP4 (postagem manual)</a>}
                {d.kind === 'FINAL' && d.state === 'READY' && (
                  <button onClick={() => setApproval({ deliverableId: d.id, accountId: channel.data?.channel.accounts[0]?.id ?? '', title: '', description: '', privacy: 'private' })}>Aprovar para publicação</button>
                )}
              </div>
              {d.approvals.length > 0 && <div className="stat">Aprovações: {d.approvals.map((a) => `${a.decision} ${formatDateTime(a.createdAt)}`).join('; ')}</div>}
            </div>
          );
        })}
      </section>

      {approval && (
        <section className="card" aria-label="Aprovar entrega" style={{ display: 'grid', gap: 6 }}>
          <strong>Aprovar entrega + destino + metadados</strong>
          {channel.data?.channel.accounts.length ? (
            <label className="field"><span>Conta de destino</span>
              <select value={approval.accountId} onChange={(e) => setApproval({ ...approval, accountId: e.target.value })}>
                {channel.data.channel.accounts.map((a) => <option key={a.id} value={a.id}>{a.platform} · {a.displayName ?? a.id}{a.isTestAccount ? ' (teste)' : ''}{a.status !== 'CONNECTED' ? ' — desconectada' : ''}</option>)}
              </select>
            </label>
          ) : (
            <div className="notice">Nenhuma conta neste canal. Baixe o MP4 para postagem manual.</div>
          )}
          <label className="field"><span>Título</span><input type="text" value={approval.title} onChange={(e) => setApproval({ ...approval, title: e.target.value })} /></label>
          <label className="field"><span>Descrição</span><textarea rows={3} value={approval.description} onChange={(e) => setApproval({ ...approval, description: e.target.value })} /></label>
          <label className="field"><span>Privacidade</span>
            <select value={approval.privacy} onChange={(e) => setApproval({ ...approval, privacy: e.target.value as 'private' })}>
              <option value="private">Privado</option><option value="unlisted">Não listado</option><option value="public">Público</option>
            </select>
          </label>
          <div className="row" style={{ gap: 6 }}>
            <button className="primary" disabled={!approval.accountId || !approval.title} onClick={() => void approve()}>Aprovar</button>
            <button onClick={() => setApproval(null)}>Cancelar</button>
          </div>
        </section>
      )}

      <section>
        <h3 style={{ margin: '4px 0' }}>Histórico</h3>
        {compare && (
          <div className="notice">
            Rev {compare.number} → exibida: {compare.changes.length ? compare.changes.join('; ') : 'sem diferenças editoriais'}
            <button className="ghost" onClick={() => setCompare(null)}>Fechar</button>
          </div>
        )}
        {history.data?.revisions.map((r) => (
          <div key={r.id} className="card" style={{ padding: 8 }}>
            <div>
              <strong>Rev {r.number}</strong> {r.id === studio.doc.revisionId && <span className="chip" data-tone="ok">exibida</span>} <span className="chip">{r.authorType === 'agent' ? 'Opus' : r.authorType}</span>
            </div>
            <div className="stat">{r.summary ?? r.command ?? '—'} · {formatDateTime(r.createdAt)}{r.restoredFromRevisionId ? ' · restauração' : ''}</div>
            {r.id !== studio.doc.revisionId && (
              <div className="row" style={{ gap: 6 }}>
                <button className="ghost" onClick={() => void doCompare(r)}>Comparar</button>
                <button className="ghost" disabled={studio.readOnly} onClick={() => void restore(r)}>Restaurar</button>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
