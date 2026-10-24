'use client';

import { use, useEffect, useState } from 'react';
import { api, describeError, formatDateTime, useApi } from '@/components/hub/api';

type ChannelDetail = {
  id: string;
  name: string;
  nameConfirmed: boolean;
  tagline: string | null;
  languages: string[];
  linkedBrand: string | null;
  rulesJson: {
    tone: string[];
    forbidden: string[];
    editorialRules: Array<{ id: string; description: string; severity: string }>;
    sensitiveTopicGuidance: string | null;
    ctas: string[];
    scriptureFromLibraryOnly: boolean;
    weeklySchedule: Record<string, string[]>;
    timezone: string;
  };
  domainJson: Record<string, unknown>;
  series: Array<{ id: string; slug: string; name: string; legacyKind: string | null; active: boolean }>;
  templates: Array<{ id: string; slug: string; version: number; name: string; engine: string }>;
  brandKits: Array<{ version: number; colorsJson: Record<string, string>; fonts: string[] }>;
  characters: Array<{ id: string; name: string; assetsVerified: boolean }>;
  accounts: Array<{ id: string; platform: string; displayName: string | null; externalId: string; status: string; isTestAccount: boolean; tokenExpiresAt: string | null }>;
};

const TABS = ['Identidade', 'Séries', 'Templates', 'Contas', 'Biblioteca vinculada', 'Regras editoriais'] as const;
const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi<{ channel: ChannelDetail }>(`/api/v3/channels/${id}`);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Identidade');
  const [form, setForm] = useState({ name: '', tagline: '', linkedBrand: '', nameConfirmed: false });
  const [status, setStatus] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const channel = data?.channel;

  useEffect(() => {
    if (channel) setForm({ name: channel.name, tagline: channel.tagline ?? '', linkedBrand: channel.linkedBrand ?? '', nameConfirmed: channel.nameConfirmed });
  }, [channel]);

  if (loading && !channel) return <div className="state" role="status">Carregando canal…</div>;
  if (error || !channel) return <div className="notice" data-tone="err" role="alert">{error ?? 'Canal não encontrado.'}</div>;

  const save = async () => {
    try {
      await api(`/api/v3/channels/${id}`, { method: 'PATCH', json: { name: form.name, tagline: form.tagline || null, linkedBrand: form.linkedBrand || null, nameConfirmed: form.nameConfirmed } });
      setStatus({ tone: 'ok', text: 'Canal salvo. Projetos de outros canais não foram alterados.' });
      await reload();
    } catch (err) {
      setStatus({ tone: 'err', text: describeError(err) });
    }
  };

  const brand = channel.brandKits[0];
  const rules = channel.rulesJson;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h1>{channel.name}</h1>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Identidade' && (
        <section className="card" style={{ display: 'grid', gap: 12 }}>
          <label className="field"><span>Nome</span><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={form.nameConfirmed} onChange={(e) => setForm({ ...form, nameConfirmed: e.target.checked })} /> Nome comercial definitivo
          </label>
          <label className="field"><span>Tagline</span><input type="text" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} /></label>
          <label className="field"><span>Marca editorial vinculada (opcional — nunca presumida)</span><input type="text" value={form.linkedBrand} onChange={(e) => setForm({ ...form, linkedBrand: e.target.value })} /></label>
          {brand && (
            <div>
              <div className="stat">Identidade visual v{brand.version} (imutável; editar cria nova versão)</div>
              <div className="row" style={{ gap: 8, marginTop: 6 }}>
                {Object.entries(brand.colorsJson).map(([k, v]) => (
                  <span key={k} className="chip"><span aria-hidden style={{ width: 12, height: 12, borderRadius: 3, background: v, display: 'inline-block' }} />{k} {v}</span>
                ))}
              </div>
              <div className="stat" style={{ marginTop: 6 }}>Fontes: {brand.fonts.join(', ') || '—'}</div>
            </div>
          )}
          {status && <div className="notice" data-tone={status.tone} role="status">{status.text}</div>}
          <div><button className="primary" onClick={() => void save()}>Salvar identidade</button></div>
        </section>
      )}

      {tab === 'Séries' && (
        <section className="card">
          <table>
            <thead><tr><th>Série</th><th>Formato legado</th><th>Estado</th></tr></thead>
            <tbody>
              {channel.series.map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.legacyKind ?? '—'}</td><td>{s.active ? 'ativa' : 'inativa'}</td></tr>)}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'Templates' && (
        <section className="card">
          <p className="stat">Versões são imutáveis: revisões antigas continuam usando a versão com que foram editadas.</p>
          <table>
            <thead><tr><th>Template</th><th>Versão</th><th>Motor</th></tr></thead>
            <tbody>
              {channel.templates.map((t) => <tr key={t.id}><td>{t.name} <span className="muted">({t.slug})</span></td><td>v{t.version}</td><td>{t.engine}</td></tr>)}
            </tbody>
          </table>
          {channel.characters.map((c) => (
            <p key={c.id} className="notice" style={{ marginTop: 12 }}>Personagem {c.name}: {c.assetsVerified ? 'arte conferida' : 'arte ainda NÃO conferida (transparência/resolução) — validar antes de usar como final'}.</p>
          ))}
        </section>
      )}

      {tab === 'Contas' && (
        <section className="card">
          <p className="stat">Contas sociais são separadas do formato do vídeo. A conta de destino aparece antes de qualquer publicação.</p>
          {channel.accounts.length === 0 ? (
            <div className="state">Nenhuma conta associada a este canal. A exportação manual de entregas continua disponível.</div>
          ) : (
            <table>
              <thead><tr><th>Plataforma</th><th>Conta</th><th>Estado</th><th>Token expira</th></tr></thead>
              <tbody>
                {channel.accounts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.platform}{a.isTestAccount ? ' (teste)' : ''}</td>
                    <td>{a.displayName ?? a.externalId}</td>
                    <td><span className="chip" data-tone={a.status === 'CONNECTED' ? 'ok' : 'err'}>{a.status === 'CONNECTED' ? 'conectada' : `${a.status.toLowerCase()} — reconectar`}</span></td>
                    <td>{formatDateTime(a.tokenExpiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === 'Biblioteca vinculada' && (
        <section className="card">
          <p>Assets do workspace usados nos projetos deste canal ficam na <a href="/hub/biblioteca">Biblioteca</a>.</p>
          {'recipeIds' in channel.domainJson && <p className="stat">Receitas preservadas: {(channel.domainJson.recipeIds as string[]).join(', ')}</p>}
          {'pillars' in channel.domainJson && <p className="stat">{(channel.domainJson.pillars as unknown[]).length} pilares editoriais preservados.</p>}
        </section>
      )}

      {tab === 'Regras editoriais' && (
        <section className="card" style={{ display: 'grid', gap: 10 }}>
          <div><strong>Tom:</strong> {rules.tone.join('; ') || '—'}</div>
          <div><strong>Evitar:</strong> {rules.forbidden.join('; ') || '—'}</div>
          {rules.scriptureFromLibraryOnly && <div className="notice">Escritura somente da biblioteca local; o agente cria a reflexão sem inventar texto bíblico.</div>}
          {rules.editorialRules.length > 0 && (
            <div>
              <strong>Regras bloqueantes</strong>
              <ul>{rules.editorialRules.map((r) => <li key={r.id}>{r.description}</li>)}</ul>
            </div>
          )}
          {rules.sensitiveTopicGuidance && <div><strong>Temas sensíveis:</strong> {rules.sensitiveTopicGuidance}</div>}
          {Object.keys(rules.weeklySchedule).length > 0 && (
            <div>
              <strong>Programação semanal ({rules.timezone})</strong>
              <ul>{Object.entries(rules.weeklySchedule).map(([d, cats]) => <li key={d}>{DAYS[Number(d)]}: {cats.join(', ')}</li>)}</ul>
            </div>
          )}
          {rules.ctas.length > 0 && <div><strong>CTAs:</strong><ul>{rules.ctas.map((c) => <li key={c}>{c}</li>)}</ul></div>}
          <p className="stat">Regras são dados do canal — nova categoria não exige mudança de código.</p>
        </section>
      )}
    </div>
  );
}
