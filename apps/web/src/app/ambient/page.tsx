import Link from 'next/link';
import { prisma, ProjectKind } from '@editor-video/db';
import { AmbientForm } from '@/components/AmbientForm';
import { STATUS_LABEL } from '@/lib/dto';

export const dynamic = 'force-dynamic';

export default async function AmbientPage() {
  const projects = await prisma.project.findMany({
    where: { kind: ProjectKind.AMBIENT },
    orderBy: { createdAt: 'desc' },
  });

  const counts = {
    total: projects.length,
    rendering: projects.filter((p) => p.status === 'QUEUED' || p.status === 'PROCESSING').length,
    waitingPreview: projects.filter((p) => p.status === 'WAITING_PREVIEW_APPROVAL').length,
    ready: projects.filter((p) => p.status === 'READY_FOR_REVIEW' || p.status === 'READY').length,
    failed: projects.filter((p) => p.status === 'FAILED').length,
  };

  return (
    <main>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Sons relaxantes</h1>
        <Link href="/ambient/library" className="muted">
          Biblioteca de sons →
        </Link>
      </div>
      <p className="muted" style={{ marginBottom: 24 }}>
        Ambientes audiovisuais longos com soundscape em camadas, preview obrigatório e checagem de
        licença.
      </p>

      <div className="row" style={{ flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <span className="badge">{counts.total} projetos</span>
        <span className="badge" data-status="PROCESSING">
          {counts.rendering} renderizando
        </span>
        <span className="badge" data-status="QUEUED">
          {counts.waitingPreview} aguardando preview
        </span>
        <span className="badge" data-status="READY_FOR_REVIEW">
          {counts.ready} prontos
        </span>
        <span className="badge" data-status="FAILED">
          {counts.failed} falhas
        </span>
      </div>

      <AmbientForm />

      <section style={{ marginTop: 32 }}>
        <h2>Projetos ambient</h2>
        {projects.length === 0 ? (
          <div className="empty">Nenhum ambiente ainda. Gere o primeiro acima.</div>
        ) : (
          projects.map((project) => (
            <a key={project.id} href={`/projects/${project.id}`} className="project-link">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{project.title}</div>
                <div className="muted">
                  {project.preset ?? 'custom'} · {project.durationMinutes ?? '—'} min
                  {project.qualityScore != null
                    ? ` · score ${Math.round(project.qualityScore)}`
                    : ''}
                  {' · '}
                  {project.createdAt.toLocaleDateString('pt-BR')}
                </div>
              </div>
              <span className="badge" data-status={project.status}>
                {STATUS_LABEL[project.status] ?? project.status}
              </span>
            </a>
          ))
        )}
      </section>
    </main>
  );
}
