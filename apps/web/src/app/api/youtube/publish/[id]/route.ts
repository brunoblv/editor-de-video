import type { NextRequest } from 'next/server';
import fsp from 'node:fs/promises';
import { Prisma } from '@prisma/client';
import { getStorage, storageKeys } from '@editor-video/core/server';
import type { MidnightPlaylistKey } from '@editor-video/core/midnight';
import { prisma, ProjectKind, ProjectStatus } from '@editor-video/db';
import { requireProjectAccess, requireUser } from '@/lib/auth-guards';
import { toProjectDTO } from '@/lib/dto';
import { ApiError, handle, json } from '@/lib/http';
import {
  addToPlaylist,
  getValidAccessToken,
  setThumbnail,
  uploadVideoResumable,
  youtubeConfigured,
} from '@/lib/youtube';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await requireProjectAccess(id);

    if (!youtubeConfigured()) {
      throw new ApiError('YouTube OAuth não configurado no servidor.');
    }

    const body = (await request.json().catch(() => ({}))) as {
      privacyStatus?: unknown;
      asShort?: unknown;
    };
    const privacyStatus =
      body.privacyStatus === 'public' || body.privacyStatus === 'unlisted'
        ? body.privacyStatus
        : 'private';
    const asShort = Boolean(body.asShort);

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) throw new ApiError('Projeto não encontrado.', 404);
    if (project.kind !== ProjectKind.AMBIENT && project.kind !== ProjectKind.CHRISTIAN) {
      throw new ApiError('Só projetos Ambient ou Canal Cristão podem ser publicados no YouTube.');
    }
    if (
      project.status !== ProjectStatus.READY_FOR_REVIEW &&
      project.status !== ProjectStatus.PUBLISHED
    ) {
      throw new ApiError('Publique apenas projetos em READY_FOR_REVIEW.');
    }
    if (!project.outputKey) throw new ApiError('Vídeo final ausente.');

    const quality =
      project.qualityJson && typeof project.qualityJson === 'object'
        ? (project.qualityJson as { passed?: boolean; licenseSafety?: number })
        : null;
    if (quality && quality.passed === false) {
      throw new ApiError('Quality check não passou — corrija antes de publicar.');
    }
    if (quality && typeof quality.licenseSafety === 'number' && quality.licenseSafety < 80) {
      throw new ApiError('License safety insuficiente para publicar.');
    }

    const channel = await prisma.youTubeChannel.findUnique({ where: { userId: user.id } });
    if (!channel) throw new ApiError('Conecte o canal YouTube em /ambient/youtube.');

    const metadata =
      project.metadataJson && typeof project.metadataJson === 'object'
        ? (project.metadataJson as {
            title?: string;
            description?: string;
            tags?: string[];
            playlists?: string[];
            shortsTitle?: string;
            shortsDescription?: string;
          })
        : {};

    const isShortFormat =
      asShort ||
      (project.ambientConfigJson &&
        typeof project.ambientConfigJson === 'object' &&
        (project.ambientConfigJson as { format?: string }).format === 'shorts');

    const title = (
      isShortFormat
        ? metadata.shortsTitle || metadata.title || project.title
        : metadata.title || project.title
    ).slice(0, 100);

    const description = (
      isShortFormat
        ? metadata.shortsDescription || metadata.description || project.title
        : metadata.description || project.title
    ).slice(0, 5000);

    const tags = Array.isArray(metadata.tags) ? metadata.tags : ['midnight relaxing sounds'];

    const storage = getStorage();
    const localPath = await storage.toLocalPath(project.outputKey);
    const file = await fsp.readFile(localPath);
    const accessToken = await getValidAccessToken(user.id);

    const videoId = await uploadVideoResumable({
      accessToken,
      file,
      title,
      description,
      tags,
      privacyStatus,
    });

    const thumbKey = storageKeys.ambientThumbnail(id);
    if (await storage.exists(thumbKey)) {
      const thumbPath = await storage.toLocalPath(thumbKey);
      const thumb = await fsp.readFile(thumbPath);
      await setThumbnail(accessToken, videoId, thumb);
    }

    const playlistMap =
      channel.playlistMapJson && typeof channel.playlistMapJson === 'object'
        ? (channel.playlistMapJson as Record<string, string>)
        : {};

    const playlistKeys = (metadata.playlists ?? []) as MidnightPlaylistKey[];
    const assigned: string[] = [];
    for (const key of playlistKeys) {
      const playlistId = playlistMap[key];
      if (!playlistId) continue;
      try {
        await addToPlaylist(accessToken, playlistId, videoId);
        assigned.push(playlistId);
      } catch {
        // Continua outras playlists.
      }
    }

    const updated = await prisma.project.update({
      where: { id },
      data: {
        status: ProjectStatus.PUBLISHED,
        publishedAt: new Date(),
        youtubeVideoId: isShortFormat ? project.youtubeVideoId : videoId,
        youtubeShortId: isShortFormat ? videoId : project.youtubeShortId,
        youtubePlaylistIds: assigned,
        stage: 'Publicado no YouTube',
        metadataJson: {
          ...metadata,
          youtubeVideoId: videoId,
          youtubeUrl: `https://youtu.be/${videoId}`,
        } as unknown as Prisma.InputJsonValue,
      },
      include: {
        clips: { orderBy: { position: 'asc' } },
        mediaAssets: { orderBy: { position: 'asc' } },
      },
    });

    return json({
      project: toProjectDTO(updated),
      youtubeVideoId: videoId,
      url: `https://youtu.be/${videoId}`,
      playlists: assigned,
    });
  });
}
