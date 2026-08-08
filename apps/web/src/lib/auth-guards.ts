import { prisma } from '@editor-video/db';
import { auth } from '@/auth';
import { ApiError } from '@/lib/http';

export type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
};

/** Exige sessão autenticada; lança ApiError 401 se ausente. */
export async function requireUser(): Promise<AuthUser> {
  const session = await auth();
  const id = session?.user?.id;
  const email = session?.user?.email;
  if (!id || !email) {
    throw new ApiError('Não autenticado.', 401);
  }
  return { id, email, name: session.user.name };
}

/**
 * Garante que o projeto existe e pertence ao usuário.
 * Projetos legados sem userId só são acessíveis após backfill.
 */
export async function requireProjectAccess(projectId: string) {
  const user = await requireUser();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ApiError('Projeto não encontrado.', 404);
  if (project.userId !== user.id) {
    throw new ApiError('Sem permissão para este projeto.', 403);
  }
  return { user, project };
}

/**
 * Autoriza leitura de uma storage key.
 * - `library/sounds/*` → qualquer usuário autenticado
 * - `projects/<id>/*` → dono do projeto
 */
export async function requireStorageKeyAccess(key: string): Promise<AuthUser> {
  const user = await requireUser();

  if (key.startsWith('library/sounds/')) {
    return user;
  }

  const match = /^projects\/([^/]+)\//.exec(key);
  if (!match) {
    throw new ApiError('Chave de storage inválida.', 403);
  }

  const projectId = match[1];
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });
  if (!project) throw new ApiError('Arquivo não encontrado.', 404);
  if (project.userId !== user.id) {
    throw new ApiError('Sem permissão para este arquivo.', 403);
  }
  return user;
}
