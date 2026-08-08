'use client';

import { useState } from 'react';

export function YoutubeConnectButton({ disabled }: { disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/youtube/connect', { method: 'POST' });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Falha ao iniciar OAuth.');
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro OAuth.');
      setBusy(false);
    }
  }

  return (
    <div>
      {error ? <div className="error">{error}</div> : null}
      <button
        className="primary"
        type="button"
        disabled={disabled || busy}
        onClick={() => void connect()}
        style={{ marginTop: 12 }}
      >
        {busy ? 'Redirecionando…' : 'Conectar canal YouTube'}
      </button>
    </div>
  );
}
