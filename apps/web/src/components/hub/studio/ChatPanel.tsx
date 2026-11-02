'use client';

import { useState } from 'react';
import { diffRevisions, type RevisionChange, type TimelineDocument } from '@editor-video/timeline';
import { api, describeError } from '../api';
import type { StudioApi } from './types';

type Message = { role: 'user' | 'agent'; text: string; tools: string[]; changes?: RevisionChange[]; baseRevisionId?: string; resultRevisionId?: string | null; cost?: number | null };

const EXAMPLES = ['Encurte a abertura para dois segundos', 'Suba as legendas no 9:16', 'Crie uma versão de 20 segundos', 'Troque o segundo trecho mantendo a trilha'];

/** Conversa com o Opus: comando → plano → patch validado → nova revisão (RF-08). */
export function ChatPanel({ studio, projectId }: { studio: StudioApi; projectId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [useSelection, setUseSelection] = useState(true);

  const send = async (command: string) => {
    if (!command.trim() || busy) return;
    const base: TimelineDocument = studio.doc;
    setBusy(true);
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: command, tools: [] }, { role: 'agent', text: '', tools: [], baseRevisionId: base.revisionId }]);
    const update = (fn: (msg: Message) => Message) => setMessages((m) => [...m.slice(0, -1), fn(m[m.length - 1]!)]);
    try {
      const res = await fetch(`/api/v3/projects/${projectId}/agent-runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command, selection: useSelection && studio.selection.length ? { itemIds: studio.selection } : undefined }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Erro ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const raw of events) {
          const line = raw.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as { type: string; text?: string; name?: string; revisionId?: string | null; costUsd?: number | null; message?: string };
          if (event.type === 'tool' && event.name) update((msg) => ({ ...msg, tools: [...msg.tools, event.name!] }));
          if (event.type === 'text' && event.text) update((msg) => ({ ...msg, text: event.text! }));
          if (event.type === 'error') update((msg) => ({ ...msg, text: `Erro: ${event.message}` }));
          if (event.type === 'done') update((msg) => ({ ...msg, text: event.text || msg.text, resultRevisionId: event.revisionId ?? null, cost: event.costUsd ?? null }));
        }
      }
      await studio.reload();
      // Alterações propostas: diff entre a revisão de partida e a atual.
      const after = await api<{ project: { timeline: TimelineDocument | null } }>(`/api/v3/projects/${projectId}`);
      if (after.project.timeline && after.project.timeline.revisionId !== base.revisionId) {
        update((msg) => ({ ...msg, changes: diffRevisions(base, after.project.timeline!) }));
      }
    } catch (err) {
      update((msg) => ({ ...msg, text: describeError(err) }));
    } finally {
      setBusy(false);
    }
  };

  const undoAgent = async (msg: Message) => {
    if (!msg.baseRevisionId) return;
    try {
      await api(`/api/v3/projects/${projectId}/revisions`, { method: 'POST', json: { restoreRevisionId: msg.baseRevisionId, expectedRevisionId: studio.doc.revisionId } });
      await studio.reload();
    } catch (err) {
      window.alert(describeError(err));
    }
  };

  return (
    <div className="chat">
      <div className="chat-log" aria-live="polite">
        {messages.length === 0 && (
          <div className="stat">
            Peça uma edição em linguagem natural. Itens bloqueados não serão alterados. Exemplos:
            <ul>{EXAMPLES.map((e) => <li key={e}><button className="ghost" onClick={() => setInput(e)}>{e}</button></li>)}</ul>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className="chat-msg" data-role={m.role}>
            {m.text || (m.role === 'agent' && busy && i === messages.length - 1 ? 'Analisando…' : '')}
            {m.tools.length > 0 && <div className="tools">Ferramentas: {m.tools.join(' → ')}</div>}
            {m.changes && m.changes.length > 0 && (
              <div className="tools">
                Alterações: {m.changes.map((c) => ('itemId' in c ? `${c.type} ${c.itemId}` : c.type === 'variant' ? `variante ${c.variantId}` : `trilha ${c.trackId}`)).join(', ')}
                <div><button className="ghost" onClick={() => void undoAgent(m)}>Desfazer alteração do agente</button></div>
              </div>
            )}
            {m.cost != null && <div className="tools">Custo estimado: US$ {m.cost.toFixed(4)}</div>}
          </div>
        ))}
      </div>
      <label className="row" style={{ gap: 6, fontSize: 13 }}>
        <input type="checkbox" checked={useSelection} onChange={(e) => setUseSelection(e.target.checked)} />
        Limitar à seleção ({studio.selection.length} item(ns))
      </label>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        style={{ display: 'grid', gap: 6 }}
      >
        <textarea rows={3} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ex.: encurte a abertura para 2 segundos" aria-label="Comando para o Opus" disabled={studio.readOnly} />
        <button className="primary" type="submit" disabled={busy || studio.readOnly || !input.trim()}>{busy ? 'Executando…' : 'Enviar ao Opus'}</button>
      </form>
    </div>
  );
}
