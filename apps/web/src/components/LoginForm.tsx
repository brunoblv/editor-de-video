'use client';

import { FormEvent, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        setError('Email ou senha inválidos.');
        return;
      }
      router.replace(callbackUrl);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '0 auto' }}>
      <h1>Entrar</h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        Acesse seus projetos e a biblioteca Ambient.
      </p>

      <form className="card" onSubmit={onSubmit}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Senha</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? (
          <p style={{ color: 'var(--accent)', margin: '0 0 12px' }}>{error}</p>
        ) : null}
        <button type="submit" className="primary" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="muted" style={{ marginTop: 16 }}>
        Não tem conta? <a href="/register">Criar conta</a>
      </p>
    </main>
  );
}
