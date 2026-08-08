import { config } from '@editor-video/core';
import pkg from '@prisma/client';

// @prisma/client é CJS: importamos o default e desestruturamos, porque os
// named exports nem sempre são detectáveis pelo interop ESM do Node.
const { PrismaClient, ProjectStatus, ProjectKind, LicenseVerdict } = pkg;

// Em dev o Next recarrega módulos a cada mudança; sem o singleton global
// o pool de conexões estoura rapidamente.
const globalForPrisma = globalThis as unknown as { prisma?: pkg.PrismaClient };

export const prisma: pkg.PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: config.databaseUrl } },
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { ProjectStatus, ProjectKind, LicenseVerdict };
export type {
  AmbientProjectAsset,
  Clip,
  MediaAsset,
  Project,
  ProjectStatus as ProjectStatusType,
  SoundAsset,
} from '@prisma/client';
export type PrismaClientType = pkg.PrismaClient;
