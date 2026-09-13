import { NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = new Set(['/login', '/register']);

/**
 * Middleware Edge-safe: só valida JWT (sem Prisma).
 * Redirects explícitos — o callback `authorized` do Auth.js era inconsistente.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const isLoggedIn = Boolean(req.auth?.user?.id || req.auth?.user?.email);

  if (PUBLIC_PATHS.has(pathname)) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL('/', req.nextUrl));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }
    const login = new URL('/login', req.nextUrl);
    login.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2|woff|ttf|otf)$).*)'],
};
