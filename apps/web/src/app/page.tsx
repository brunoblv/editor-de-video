import { prisma } from '@editor-video/db';
import { auth } from '@/auth';
import { ChristianBatchForm } from '@/components/ChristianBatchForm';
import { NewProjectForm } from '@/components/NewProjectForm';
import { KIND_LABEL, STATUS_LABEL } from '@/lib/dto';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const projects = await prisma.project.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { clips: true, mediaAssets: true } } },
  });

  return (
    <main>
      <h1>Editor de vídeo</h1>
      <p className="muted" style={{ marginBottom: 28 }}>
        Top List com upload manual, Curiosidade autônoma, ou{' '}
        <a href="/ambient">Sons relaxantes / Ambient</a>.
      </p>

      <NewProjectForm />
      <ChristianBatchForm />

      <section style={{ marginTop: 32 }}>
        <h2>Projetos</h2>
        {projects.length === 0 ? (
          <div className="empty">Nenhum projeto ainda. Crie o primeiro acima.</div>
        ) : (
          projects.map((project) => (
            <a key={project.id} href={`/projects/${project.id}`} className="project-link">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{project.title}</div>
                <div className="muted">
                  {KIND_LABEL[project.kind] ?? project.kind}
                  {project.kind === 'CURIOSIDADE' || project.kind === 'CHRISTIAN'
                    ? ` · ${project._count.mediaAssets} mídia${project._count.mediaAssets === 1 ? '' : 's'}`
                    : project.kind === 'AMBIENT'
                      ? ` · ${project.durationMinutes ?? '—'} min`
                      : project.kind === 'RABISCO'
                        ? ''
                        : ` · ${project._count.clips} clipe${project._count.clips === 1 ? '' : 's'}`}
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
