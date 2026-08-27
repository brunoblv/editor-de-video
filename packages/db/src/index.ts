import { ProjectStatus, ProjectKind, LicenseVerdict, type PrismaClient } from '@prisma/client';
import type {
  AmbientProjectAsset,
  BibleVerse,
  Clip,
  MediaAsset,
  Project,
  ProjectStatus as ProjectStatusType,
  SoundAsset,
} from '@prisma/client';

export { prisma } from './client.js';
export { ProjectStatus, ProjectKind, LicenseVerdict };
export type { AmbientProjectAsset, BibleVerse, Clip, MediaAsset, Project, ProjectStatusType, SoundAsset };
export type PrismaClientType = PrismaClient;

export {
  youtubeConfigured,
  getYoutubeAuthUrl,
  exchangeCode,
  getValidAccessToken,
  fetchMyChannel,
  ensureMidnightPlaylists,
  uploadVideoResumable,
  setThumbnail,
  addToPlaylist,
} from './youtube.js';

export { selectPillar, selectDistinctPillars } from './christian.js';
