'use client';

import { formatDateTime, useApi } from '@/components/hub/api';

type Overview = {
  continueEditing: Array<{ id: string; title: string; updatedAt: string; channel: { name: string } }>;
  awaitingReview: Array<{ id: string; createdAt: string; variantId: string | null; project: { id: string; title: string; channel: { name: string } } }>;
  failedJobs: Array<{ id: string; kind: string; errorMessage: string | null; errorCategory: string | null; finishedAt: string; project: { id: string; title: string } }>;
  upcoming: Array<{ id: string; scheduledAt: string; state: string; platform: string; socialAccount: { displayName: string | null } | null; project: { title: string; channel: { name: string } } }>;
  pendingSchedules: number;
  disconnectedAccounts: Array<{ id: string; displayName: string | null; platform: string; status: string }>;
  capacity: { activeWorkers: number; running: number; stalled: number; queued: Record<string, number> };
};

export default function OverviewPage() {
  const { data, error, loading, reload } = useApi<Overview>('/api/v3/overview');

  if (loading && !data) return <div className="state" role="status">Carregando visão geral…</div>;
  if (error) return <div className="notice" data-tone="err" role="alert">{error} <button onClick={() => void reload()}>Tentar de novo</button></div>;
  if (!data) return null;

  const queued = Object.values(data.capacity.queued).reduce((a, b) => a + b, 0);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1>Visão geral</h1>

      {data.capacity.stalled > 0 && (
        <div className="notice" data-tone="err" role="alert">
          {data.capacity.stalled} job(s) sem sinal do worker. Verifique se o render-worker está rodando; a <a href="/hub/fila">fila</a> permite cancelar ou repetir.
        </div>
      )}
      {data.disconnectedAccounts.length > 0 && (
        <div className="notice" role="alert">
          Contas desconectadas: {data.disconnectedAccounts.map((a) => `${a.displayName ?? a.platform} (${a.status})`).join(', ')}. Reconecte em <a href="/hub/canais">Canais → Contas</a>; a exportação manual continua disponível.
        </div>
      )}
      {data.pendingSchedules > 0 && (
        <div className="notice">{data.pendingSchedules} agendamento(s) migrado(s) do legado aguardam revisão e nova aprovação — nada será publicado automaticamente.</div>
      )}

      <section className="card">
        <h2>Continuar edição</h2>
        {data.continueEditing.length === 0 ? (
          <div className="state">Nenhum projeto em edição. <a href="/hub/projetos">Criar projeto</a></div>
        ) : (
          <div className="cards">
            {data.continueEditing.map((p) => (
              <a key={p.id} className="card" href={`/hub/projetos/${p.id}`}>
                <strong>{p.title}</strong>
                <div className="stat">{p.channel.name} · {formatDateTime(p.updatedAt)}</div>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Entregas aguardando revisão</h2>
        {data.awaitingReview.length === 0 ? (
          <div className="state">Nada aguardando revisão.</div>
        ) : (
          <table>
            <tbody>
              {data.awaitingReview.map((d) => (
                <tr key={d.id}>
                  <td><a href={`/hub/projetos/${d.project.id}?tab=revisao`}>{d.project.title}</a></td>
                  <td>{d.project.channel.name}</td>
                  <td>{d.variantId ?? 'principal'}</td>
                  <td>{formatDateTime(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Erros acionáveis</h2>
        {data.failedJobs.length === 0 ? (
          <div className="state">Sem falhas nos últimos 7 dias.</div>
        ) : (
          <table>
            <tbody>
              {data.failedJobs.map((j) => (
                <tr key={j.id}>
                  <td><a href={`/hub/projetos/${j.project.id}`}>{j.project.title}</a></td>
                  <td>{j.kind}</td>
                  <td><span className="chip" data-tone="err">{j.errorCategory ?? 'erro'}</span> {j.errorMessage?.slice(0, 160)}</td>
                  <td><a href="/hub/fila">Repetir na fila</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Próximos agendamentos</h2>
        {data.upcoming.length === 0 ? (
          <div className="state">Nenhuma publicação agendada. <a href="/hub/calendario">Abrir calendário</a></div>
        ) : (
          <table>
            <tbody>
              {data.upcoming.map((p) => (
                <tr key={p.id}>
                  <td>{formatDateTime(p.scheduledAt)}</td>
                  <td>{p.project.title}</td>
                  <td>{p.project.channel.name} → {p.socialAccount?.displayName ?? p.platform}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Capacidade do worker</h2>
        <p className="stat">
          Workers ativos: {data.capacity.activeWorkers} · Em execução: {data.capacity.running} · Na fila: {queued}
          {Object.entries(data.capacity.queued).map(([q, n]) => ` · ${q}: ${n}`)}
        </p>
      </section>
    </div>
  );
}
