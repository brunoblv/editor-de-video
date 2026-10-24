'use client';

import { useCallback, useEffect, useState } from 'react';

export class HubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly payload: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function api<T = Record<string, unknown>>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new HubApiError(String(data.error ?? `Erro ${res.status}`), res.status, String(data.code ?? 'INTERNAL'), data);
  return data as T;
}

/** Mensagem acionável por categoria de erro (§13/§14.4). */
export function describeError(err: unknown): string {
  if (!(err instanceof HubApiError)) return (err as Error)?.message ?? 'Erro inesperado.';
  switch (err.code) {
    case 'CONFLICT':
      return `${err.message} Recarregue a revisão atual e tente de novo.`;
    case 'LOCKED':
      return `${err.message}`;
    case 'LIMIT':
      return `Limite atingido: ${err.message}`;
    case 'DEPENDENCY_MISSING':
      return `Dependência ausente: ${err.message}`;
    case 'TRANSIENT':
      return `Indisponível no momento: ${err.message} Tente novamente em instantes.`;
    case 'FORBIDDEN':
      return `Sem permissão: ${err.message}`;
    default:
      return err.message;
  }
}

export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const reload = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      setData(await api<T>(url));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}

const CHANNEL_KEY = 'hub.channel';

/** Canal selecionado persistente ("" = Todos os canais). */
export function useSelectedChannel(): [string, (id: string) => void] {
  const [channel, setChannel] = useState('');
  useEffect(() => {
    try {
      setChannel(localStorage.getItem(CHANNEL_KEY) ?? '');
    } catch {
      /* armazenamento indisponível */
    }
    const onChange = (e: Event) => setChannel((e as CustomEvent<string>).detail);
    window.addEventListener('hub:channel', onChange);
    return () => window.removeEventListener('hub:channel', onChange);
  }, []);
  const update = useCallback((id: string) => {
    setChannel(id);
    try {
      localStorage.setItem(CHANNEL_KEY, id);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent('hub:channel', { detail: id }));
  }, []);
  return [channel, update];
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
}
