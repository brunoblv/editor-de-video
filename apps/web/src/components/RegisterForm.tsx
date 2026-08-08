'use client';

import { FormEvent, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível criar a conta.');
        return;
      }

      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        setError('Conta criada, mas o login falhou. Tente entrar.');
        router.push('/login');
        return;
      }
      router.replace('/');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '0 auto' }}>
      <h1>Criar conta</h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        Cadastre-se para criar e gerenciar projetos.
      </p>

      <form className="card" onSubmit={onSubmit}>
        <label className="field">
          <span>Nome</span>
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
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
          <span>Senha (mín. 8)</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? (
          <p style={{ color: 'var(--accent)', margin: '0 0 12px' }}>{error}</p>
        ) : null}
        <button type="submit" className="primary" disabled={loading}>
          {loading ? 'Criando…' : 'Criar conta'}
        </button>
      </form>

      <p className="muted" style={{ marginTop: 16 }}>
        Já tem conta? <a href="/login">Entrar</a>
      </p>
    </main>
  );
}
