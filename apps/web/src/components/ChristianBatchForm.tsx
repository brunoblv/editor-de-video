'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

const DEFAULT_TIMES = ['10:00', '12:00', '15:00', '20:00'];

function todayLocalISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function ChristianBatchForm() {
  const router = useRouter();
  const [date, setDate] = useState(todayLocalISO());
  const [times, setTimes] = useState<string[]>(DEFAULT_TIMES);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ title: string; scheduledAt: string | null }[] | null>(null);

  function updateTime(index: number, value: string): void {
    setTimes((prev) => prev.map((t, i) => (i === index ? value : t)));
  }

  function addTime(): void {
    setTimes((prev) => [...prev, '18:00']);
  }

  function removeTime(index: number): void {
    setTimes((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/christian/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, times }),
      });
      const payload = (await response.json()) as {
        projects?: { title: string; scheduledAt: string | null }[];
        error?: string;
      };
      if (!response.ok || !payload.projects) {
        throw new Error(payload.error ?? 'Não foi possível gerar o lote.');
      }
      setResult(payload.projects);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={onSubmit} style={{ marginTop: 16 }}>
      <h2>Gerar lote do dia (Canal Cristão)</h2>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Gera um vídeo com tema diferente para cada horário abaixo. O sistema escolhe os pilares
        automaticamente (sem repetir entre si) e publica sozinho no YouTube (agendado, privado até a
        hora) assim que cada vídeo terminar de renderizar.
      </p>

      {error ? <div className="error">{error}</div> : null}

      <div style={{ marginBottom: 16 }}>
        <label htmlFor="batch-date">Dia da postagem</label>
        <input
          id="batch-date"
          type="date"
          value={date}
          min={todayLocalISO()}
          onChange={(event) => setDate(event.target.value)}
          disabled={saving}
        />
      </div>

      {times.map((time, index) => (
        <div key={index} className="row" style={{ marginBottom: 8, alignItems: 'center' }}>
          <input
            type="time"
            value={time}
            onChange={(event) => updateTime(index, event.target.value)}
            disabled={saving}
          />
          {times.length > 1 ? (
            <button type="button" className="ghost" disabled={saving} onClick={() => removeTime(index)}>
              remover
            </button>
          ) : null}
        </div>
      ))}

      <div className="row" style={{ marginTop: 8, marginBottom: 16 }}>
        <button type="button" className="ghost" disabled={saving || times.length >= 12} onClick={addTime}>
          + adicionar horário
        </button>
      </div>

      <button className="primary" type="submit" disabled={saving || times.length === 0}>
        {saving ? 'Gerando...' : `Gerar ${times.length} vídeo${times.length === 1 ? '' : 's'}`}
      </button>

      {result ? (
        <div style={{ marginTop: 16 }}>
          <p className="muted" style={{ marginBottom: 8 }}>
            Criados e enfileirados:
          </p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {result.map((item, index) => (
              <li key={index}>
                {item.title}
                {item.scheduledAt
                  ? ` — ${new Date(item.scheduledAt).toLocaleString('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}`
                  : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}
