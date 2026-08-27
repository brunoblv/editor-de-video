import { notFound, redirect } from 'next/navigation';
import { config } from '@editor-video/core/server';
import { prisma, ProjectKind } from '@editor-video/db';
import { auth } from '@/auth';
import { AmbientEditor } from '@/components/AmbientEditor';
import { ChristianEditor } from '@/components/ChristianEditor';
import { CuriosidadeEditor } from '@/components/CuriosidadeEditor';
import { ProjectEditor } from '@/components/ProjectEditor';
import { toProjectDTO } from '@/lib/dto';

export const dynamic = 'force-dynamic';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      clips: { orderBy: { position: 'asc' } },
      mediaAssets: { orderBy: { position: 'asc' } },
    },
  });
  if (!project || project.userId !== session.user.id) notFound();

  const dto = toProjectDTO(project);

  if (project.kind === ProjectKind.CURIOSIDADE) {
    return <CuriosidadeEditor initialProject={dto} />;
  }

  if (project.kind === ProjectKind.AMBIENT) {
    return <AmbientEditor initialProject={dto} />;
  }

  if (project.kind === ProjectKind.CHRISTIAN) {
    return <ChristianEditor initialProject={dto} />;
  }

  return (
    <ProjectEditor
      initialProject={dto}
      limits={{
        minClips: config.limits.minClipsPerProject,
        maxClips: config.limits.maxClipsPerProject,
        maxSizeMb: Math.round(config.limits.maxClipSizeBytes / 1024 / 1024),
        maxDurationSec: config.limits.maxClipDurationSec,
      }}
    />
  );
}
