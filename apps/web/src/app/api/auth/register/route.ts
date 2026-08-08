import type { NextRequest } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@editor-video/db';
import { ApiError, handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

interface RegisterBody {
  email?: unknown;
  password?: unknown;
  name?: unknown;
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(async () => {
    const body = (await request.json()) as RegisterBody;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const name =
      typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 80) : null;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ApiError('Email inválido.');
    }
    if (password.length < 8) {
      throw new ApiError('A senha precisa ter pelo menos 8 caracteres.');
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ApiError('Já existe uma conta com este email.', 409);

    const passwordHash = await hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, name },
      select: { id: true, email: true, name: true },
    });

    return json({ user }, 201);
  });
}
