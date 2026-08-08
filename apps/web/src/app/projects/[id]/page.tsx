import { notFound } from 'next/navigation';
import { config } from '@editor-video/core';
import { prisma, ProjectKind } from '@editor-video/db';
import { AmbientEditor } from '@/components/AmbientEditor';
import { CuriosidadeEditor } from '@/components/CuriosidadeEditor';
import { ProjectEditor } from '@/components/ProjectEditor';
import { toProjectDTO } from '@/lib/dto';

export const dynamic = 'force-dynamic';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      clips: { orderBy: { position: 'asc' } },
      mediaAssets: { orderBy: { position: 'asc' } },
    },
  });
  if (!project) notFound();

  const dto = toProjectDTO(project);

  if (project.kind === ProjectKind.CURIOSIDADE) {
    return <CuriosidadeEditor initialProject={dto} />;
  }

  if (project.kind === ProjectKind.AMBIENT) {
    return <AmbientEditor initialProject={dto} />;
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
