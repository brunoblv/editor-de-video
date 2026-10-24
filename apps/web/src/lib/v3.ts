import { NextResponse } from 'next/server';
import { DomainError } from '@editor-video/domain';
import { ensureWorkspaceForUser, PatchRejectedError, type Actor } from '@editor-video/db/v3';
import { ZodError } from 'zod';
import { requireUser } from '@/lib/auth-guards';
import { ApiError } from '@/lib/http';

/**
 * Ator autenticado da V3. No primeiro acesso cria o workspace pessoal com
 * os canais preservados (Midnight, Cristão, Rabisco).
 */
export async function requireActor(): Promise<Actor & { workspaceId: string; email: string }> {
  const user = await requireUser();
  const workspaceId = await ensureWorkspaceForUser(user.id, user.name ? `Workspace de ${user.name}` : user.email);
  return { userId: user.id, workspaceId, email: user.email };
}

/** BigInt → string para JSON. */
export function jsonSafe<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(jsonSafe(data), { status });
}

/**
 * Erros distinguíveis pela interface (§13): conflito, limite, dependência
 * ausente, transitório, inválido, bloqueado, sem permissão.
 */
export async function v3(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PatchRejectedError) {
      return NextResponse.json({ error: err.message, code: err.code, patchError: err.patchError }, { status: err.status });
    }
    if (err instanceof DomainError) {
      return NextResponse.json({ error: err.message, code: err.code, details: err.details ?? null }, { status: err.status });
    }
    if (err instanceof ZodError) {
      return NextResponse.json({ error: 'Dados inválidos.', code: 'INVALID', issues: err.issues }, { status: 422 });
    }
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message, code: err.status === 401 ? 'UNAUTHENTICATED' : 'INVALID' }, { status: err.status });
    }
    console.error('[api/v3] erro não tratado', err);
    return NextResponse.json({ error: 'Erro inesperado no servidor.', code: 'INTERNAL' }, { status: 500 });
  }
}

export async function body<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new DomainError('INVALID', 'Corpo JSON inválido.');
  }
}
