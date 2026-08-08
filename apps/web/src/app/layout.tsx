import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Compilador de Clipes',
  description: 'Top List, Curiosidade e Sons Relaxantes.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="shell">
          <header className="topbar">
            <a href="/" className="brand">
              Compilador<span>.</span>
            </a>
            <nav className="row" style={{ gap: 16 }}>
              <a href="/" className="muted">
                Projetos
              </a>
              <a href="/ambient" className="muted">
                Ambient
              </a>
              <a href="/ambient/library" className="muted">
                Biblioteca
              </a>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
