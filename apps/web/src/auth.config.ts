import type { NextAuthConfig } from 'next-auth';

/**
 * Config Edge-safe (sem Prisma/bcrypt/fs).
 * Usada pelo middleware; a authorize com DB fica só em auth.ts (Node).
 */
export const authConfig = {
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        if (user.email) token.email = user.email;
        if (user.name !== undefined) token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.sub) session.user.id = token.sub;
        if (typeof token.email === 'string') session.user.email = token.email;
        if (typeof token.name === 'string' || token.name === null) {
          session.user.name = token.name;
        }
      }
      return session;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
