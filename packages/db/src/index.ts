import { PrismaClient, ProjectStatus, ProjectKind, LicenseVerdict } from '@prisma/client';
import { config } from '@editor-video/core';
import type {
  AmbientProjectAsset,
  Clip,
  MediaAsset,
  Project,
  ProjectStatus as ProjectStatusType,
  SoundAsset,
} from '@prisma/client';

// Em dev o Next recarrega módulos a cada mudança; sem o singleton global
// o pool de conexões estoura rapidamente.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: config.databaseUrl } },
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { ProjectStatus, ProjectKind, LicenseVerdict };
export type { AmbientProjectAsset, Clip, MediaAsset, Project, ProjectStatusType, SoundAsset };
export type PrismaClientType = PrismaClient;
