import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import { auth, signOut } from '@/auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'Compilador de Clipes',
  description: 'Top List, Curiosidade e Sons Relaxantes.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  return (
    <html lang="pt-BR">
      <body>
        <div className="shell">
          <header className="topbar">
            <a href="/" className="brand">
              Compilador<span>.</span>
            </a>
            <nav className="row" style={{ gap: 16, alignItems: 'center' }}>
              {session?.user ? (
                <>
                  <a href="/" className="muted">
                    Projetos
                  </a>
                  <a href="/ambient" className="muted">
                    Ambient
                  </a>
                  <a href="/ambient/library" className="muted">
                    Biblioteca
                  </a>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {session.user.email}
                  </span>
                  <form
                    action={async () => {
                      'use server';
                      await signOut({ redirectTo: '/login' });
                    }}
                  >
                    <button type="submit" className="primary" style={{ padding: '6px 10px' }}>
                      Sair
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <a href="/login" className="muted">
                    Entrar
                  </a>
                  <a href="/register" className="muted">
                    Criar conta
                  </a>
                </>
              )}
            </nav>
          </header>
          <Suspense fallback={null}>{children}</Suspense>
        </div>
      </body>
    </html>
  );
}
