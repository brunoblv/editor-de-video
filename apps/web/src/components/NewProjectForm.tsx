'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PILLARS } from '@editor-video/core/christian';

type Mode = 'TOP_LIST' | 'CURIOSIDADE' | 'CHRISTIAN' | 'RABISCO';
type CaptionStyleOption = 'minimal' | 'highlight' | 'handwritten';

const CAPTION_STYLE_LABELS: Record<CaptionStyleOption, string> = {
  minimal: 'Minimalista — texto limpo, sem marcação',
  highlight: 'Highlight — marca-texto na palavra narrada',
  handwritten: 'Manuscrita — fonte à mão, tom introspectivo',
};

export function NewProjectForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('CURIOSIDADE');
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [pillar, setPillar] = useState('');
  const [rabiscoThought, setRabiscoThought] = useState('');
  const [watermark, setWatermark] = useState('');
  const [captionStyle, setCaptionStyle] = useState<CaptionStyleOption>('minimal');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const body =
        mode === 'CURIOSIDADE'
          ? { kind: 'CURIOSIDADE', topic, watermark, captionStyle }
          : mode === 'CHRISTIAN'
            ? { kind: 'CHRISTIAN', pillar, watermark, captionStyle }
            : mode === 'RABISCO'
              ? { kind: 'RABISCO', rabiscoThought, watermark, captionStyle }
              : { kind: 'TOP_LIST', title, watermark, captionStyle };

      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { project?: { id: string }; error?: string };
      if (!response.ok || !payload.project) {
        throw new Error(payload.error ?? 'Não foi possível criar o projeto.');
      }
      router.push(`/projects/${payload.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
      setSaving(false);
    }
  }

  const canSubmit =
    mode === 'CURIOSIDADE'
      ? topic.trim().length >= 3
      : mode === 'CHRISTIAN'
        ? true
        : mode === 'RABISCO'
          ? rabiscoThought.trim().length >= 10
          : title.trim().length >= 3;

  return (
    <form className="card" onSubmit={onSubmit}>
      <h2>Novo projeto</h2>
      {error ? <div className="error">{error}</div> : null}

      <div className="row" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={mode === 'CURIOSIDADE' ? 'primary' : 'ghost'}
          onClick={() => setMode('CURIOSIDADE')}
        >
          Curiosidade (V2)
        </button>
        <button
          type="button"
          className={mode === 'TOP_LIST' ? 'primary' : 'ghost'}
          onClick={() => setMode('TOP_LIST')}
        >
          Top List
        </button>
        <button
          type="button"
          className={mode === 'CHRISTIAN' ? 'primary' : 'ghost'}
          onClick={() => setMode('CHRISTIAN')}
        >
          Canal Cristão
        </button>
        <button
          type="button"
          className={mode === 'RABISCO' ? 'primary' : 'ghost'}
          onClick={() => setMode('RABISCO')}
        >
          Rabisco — Pensamento
        </button>
      </div>

      {mode === 'RABISCO' ? (
        <div>
          <label htmlFor="rabiscoThought">O que você está pensando?</label>
          <textarea
            id="rabiscoThought"
            value={rabiscoThought}
            onChange={(event) => setRabiscoThought(event.target.value)}
            placeholder="Escreva aqui o que você está sentindo, pensando ou querendo desabafar..."
            rows={6}
            maxLength={2000}
            required
          />
          <p className="muted" style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>
            O Rabisco escreve a reflexão, gera narração, legendas e as cenas do personagem sozinho.
          </p>
        </div>
      ) : mode === 'CHRISTIAN' ? (
        <div>
          <label htmlFor="pillar">Pilar de conteúdo (opcional)</label>
          <select id="pillar" value={pillar} onChange={(event) => setPillar(event.target.value)}>
            <option value="">Deixar o sistema escolher automaticamente</option>
            {PILLARS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <p className="muted" style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>
            O sistema busca versículo, gera roteiro com Gemini, narração, legendas e o personagem
            visual sozinho.
          </p>
        </div>
      ) : mode === 'CURIOSIDADE' ? (
        <div>
          <label htmlFor="topic">Tema</label>
          <input
            id="topic"
            type="text"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="curiosidades sobre o espaço"
            maxLength={160}
            required
          />
          <p className="muted" style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>
            O sistema gera roteiro, busca mídia licenciada, narração e legendas sozinho.
          </p>
        </div>
      ) : (
        <div>
          <label htmlFor="title">Título</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Top 5 momentos constrangedores"
            maxLength={80}
            required
          />
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <label htmlFor="watermark">Marca d&apos;água (opcional)</label>
        <input
          id="watermark"
          type="text"
          value={watermark}
          onChange={(event) => setWatermark(event.target.value)}
          placeholder="@seucanal"
          maxLength={40}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <label htmlFor="captionStyle">Estilo da legenda</label>
        <select
          id="captionStyle"
          value={captionStyle}
          onChange={(event) => setCaptionStyle(event.target.value as CaptionStyleOption)}
        >
          {(Object.keys(CAPTION_STYLE_LABELS) as CaptionStyleOption[]).map((option) => (
            <option key={option} value={option}>
              {CAPTION_STYLE_LABELS[option]}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 16 }}>
        <button className="primary" type="submit" disabled={saving || !canSubmit}>
          {saving ? 'Criando...' : mode === 'RABISCO' ? 'Criar reflexão' : 'Criar projeto'}
        </button>
      </div>
    </form>
  );
}
