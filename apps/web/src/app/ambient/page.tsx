import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MIDNIGHT_BRAND, MIDNIGHT_TAGLINE, MIDNIGHT_UNIVERSES } from '@editor-video/core/midnight';
import { prisma, ProjectKind } from '@editor-video/db';
import { auth } from '@/auth';
import { AmbientForm } from '@/components/AmbientForm';
import { STATUS_LABEL } from '@/lib/dto';

export const dynamic = 'force-dynamic';

export default async function AmbientPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const projects = await prisma.project.findMany({
    where: { kind: ProjectKind.AMBIENT, userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  });

  const counts = {
    total: projects.length,
    rendering: projects.filter((p) => p.status === 'QUEUED' || p.status === 'PROCESSING').length,
    waitingPreview: projects.filter((p) => p.status === 'WAITING_PREVIEW_APPROVAL').length,
    ready: projects.filter((p) => p.status === 'READY_FOR_REVIEW' || p.status === 'READY').length,
    published: projects.filter((p) => p.status === 'PUBLISHED').length,
    failed: projects.filter((p) => p.status === 'FAILED').length,
  };

  return (
    <main>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>{MIDNIGHT_BRAND}</h1>
        <div className="row" style={{ gap: 12 }}>
          <Link href="/ambient/youtube" className="muted">
            YouTube →
          </Link>
          <Link href="/ambient/library" className="muted">
            Biblioteca de sons →
          </Link>
        </div>
      </div>
      <p className="muted" style={{ marginBottom: 8 }}>
        {MIDNIGHT_TAGLINE}
      </p>
      <p className="muted" style={{ marginBottom: 24 }}>
        Fábrica de soundscapes noturnos: receita → áudio → visual → preview → revisão → YouTube.
      </p>

      <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {MIDNIGHT_UNIVERSES.map((u) => (
          <span key={u.id} className="badge" title={u.blurb}>
            {u.label}
          </span>
        ))}
      </div>

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
        <span className="badge" data-status="PUBLISHED">
          {counts.published} publicados
        </span>
        <span className="badge" data-status="FAILED">
          {counts.failed} falhas
        </span>
      </div>

      <AmbientForm />

      <section style={{ marginTop: 32 }}>
        <h2>Biblioteca de experiências</h2>
        {projects.length === 0 ? (
          <div className="empty">Nenhum ambiente ainda. Escolha um universo acima.</div>
        ) : (
          projects.map((project) => (
            <a key={project.id} href={`/projects/${project.id}`} className="project-link">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{project.title}</div>
                <div className="muted">
                  {project.universe ?? project.preset ?? 'custom'}
                  {project.variationId ? ` · ${project.variationId}` : ''}
                  {' · '}
                  {project.durationMinutes ?? '—'} min
                  {project.qualityScore != null
                    ? ` · score ${Math.round(project.qualityScore)}`
                    : ''}
                  {project.youtubeVideoId ? ' · YT' : ''}
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
