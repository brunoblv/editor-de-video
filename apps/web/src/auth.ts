import NextAuth, { type Session } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { prisma } from '@editor-video/db';
import { authConfig } from '@/auth.config';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
    };
  }

  interface User {
    id: string;
    email: string;
    name?: string | null;
  }
}

const nextAuth = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === 'string' ? credentials.email.trim().toLowerCase() : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const ok = await compare(password, user.passwordHash);
        if (!ok) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
});

export const { handlers, signIn, signOut } = nextAuth;

/** Login só é exigido com AUTH_REQUIRED=true; caso contrário todos usam o usuário local. */
export const authRequired = process.env.AUTH_REQUIRED === 'true';

const LOCAL_EMAIL = 'local@localhost';
let localUser: Promise<{ id: string; email: string; name: string | null }> | undefined;

/** Usuário mais antigo do banco (preserva projetos existentes) ou um usuário local criado sob demanda. */
function getLocalUser() {
  localUser ??= (async () => {
    const existing = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
    const user =
      existing ??
      (await prisma.user.upsert({
        where: { email: LOCAL_EMAIL },
        update: {},
        create: { email: LOCAL_EMAIL, name: 'Local', passwordHash: '!' },
      }));
    return { id: user.id, email: user.email, name: user.name };
  })().catch((err) => {
    localUser = undefined;
    throw err;
  });
  return localUser;
}

export async function auth(): Promise<Session | null> {
  const session = await nextAuth.auth();
  if (session?.user?.id || authRequired) return session;
  const user = await getLocalUser();
  return { user, expires: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString() };
}
