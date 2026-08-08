'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  MIDNIGHT_RECIPES,
  MIDNIGHT_TAGLINE,
  MIDNIGHT_UNIVERSES,
  getMidnightRecipe,
  type MidnightUniverse,
} from '@editor-video/core/midnight';

export function AmbientForm() {
  const router = useRouter();
  const [universe, setUniverse] = useState<MidnightUniverse | ''>('');
  const [recipeId, setRecipeId] = useState(MIDNIGHT_RECIPES[0]!.id);
  const [variationId, setVariationId] = useState<string>(MIDNIGHT_RECIPES[0]!.variations[0]!.id);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [format, setFormat] = useState<'youtube' | 'shorts'>('youtube');
  const [batchMode, setBatchMode] = useState(false);
  const [selectedVariations, setSelectedVariations] = useState<string[]>([
    MIDNIGHT_RECIPES[0]!.variations[0]!.id,
  ]);
  const [selectedDurations, setSelectedDurations] = useState<number[]>([60]);
  const [autoSearch, setAutoSearch] = useState(true);
  const [generateThumbnail, setGenerateThumbnail] = useState(true);
  const [generateMetadata, setGenerateMetadata] = useState(true);
  const [qualityCheck, setQualityCheck] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recipes = useMemo(() => {
    if (!universe) return MIDNIGHT_RECIPES;
    return MIDNIGHT_RECIPES.filter((r) => r.universe === universe);
  }, [universe]);

  const recipe = getMidnightRecipe(recipeId);

  function selectRecipe(id: string) {
    const next = getMidnightRecipe(id);
    setRecipeId(next.id);
    setVariationId(next.variations[0]!.id);
    setSelectedVariations([next.variations[0]!.id]);
    setDurationMinutes(next.defaultDurationsMin[0] ?? 60);
    setSelectedDurations([next.defaultDurationsMin[0] ?? 60]);
  }

  function selectUniverse(id: MidnightUniverse | '') {
    setUniverse(id);
    if (id) {
      const first = MIDNIGHT_RECIPES.find((r) => r.universe === id);
      if (first) selectRecipe(first.id);
    }
  }

  function toggleVariation(id: string) {
    setSelectedVariations((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleDuration(min: number) {
    setSelectedDurations((prev) =>
      prev.includes(min) ? prev.filter((x) => x !== min) : [...prev, min],
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = batchMode
        ? {
            recipeId,
            createBatch: true,
            variations: selectedVariations,
            durations: selectedDurations,
            format,
            autoSearch,
            generateThumbnail,
            generateMetadata,
            qualityCheck,
            startPreview: true,
          }
        : {
            recipeId,
            variationId,
            durationMinutes,
            format,
            autoSearch,
            generateThumbnail,
            generateMetadata,
            qualityCheck,
            startPreview: true,
          };

      const res = await fetch('/api/ambient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        project?: { id: string };
        projects?: Array<{ id: string }>;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Falha ao criar.');

      if (batchMode && data.projects?.length) {
        router.push('/ambient');
        router.refresh();
      } else if (data.project?.id) {
        router.push(`/projects/${data.project.id}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    } finally {
      setBusy(false);
    }
  }

  const batchCount = selectedVariations.length * selectedDurations.length;

  return (
    <form className="card" onSubmit={(e) => void onSubmit(e)}>
      <h2 style={{ marginTop: 0 }}>Escolha onde você quer estar esta noite</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {MIDNIGHT_TAGLINE}
      </p>

      {error ? <div className="error">{error}</div> : null}

      <label>
        Universo
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            className={!universe ? 'primary' : undefined}
            onClick={() => selectUniverse('')}
          >
            Todos
          </button>
          {MIDNIGHT_UNIVERSES.map((u) => (
            <button
              key={u.id}
              type="button"
              className={universe === u.id ? 'primary' : undefined}
              onClick={() => selectUniverse(u.id)}
              title={u.blurb}
            >
              {u.label}
            </button>
          ))}
        </div>
      </label>

      <label style={{ display: 'block', marginTop: 16 }}>
        Receita
        <select
          value={recipeId}
          onChange={(e) => selectRecipe(e.target.value)}
          style={{ width: '100%', marginTop: 6 }}
        >
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>
              Ep {String(r.episode).padStart(2, '0')} — {r.name} ({r.pillar})
            </option>
          ))}
        </select>
      </label>
      <p className="muted" style={{ marginTop: 6 }}>
        {recipe.experience} · {recipe.mainSound}
      </p>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
        <input
          type="checkbox"
          checked={batchMode}
          onChange={(e) => setBatchMode(e.target.checked)}
        />
        Gerar lote experimental (variações × durações)
      </label>

      {!batchMode ? (
        <div className="grid-2" style={{ marginTop: 12 }}>
          <label>
            Variação
            <select
              value={variationId}
              onChange={(e) => setVariationId(e.target.value)}
              style={{ width: '100%', marginTop: 6 }}
            >
              {recipe.variations.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label} — {v.benefit}
                </option>
              ))}
            </select>
          </label>
          <label>
            Duração (min)
            <select
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              style={{ width: '100%', marginTop: 6 }}
            >
              {recipe.defaultDurationsMin.map((d) => (
                <option key={d} value={d}>
                  {d} min
                </option>
              ))}
              {!recipe.defaultDurationsMin.includes(360) ? (
                <option value={360}>360 min</option>
              ) : null}
              {!recipe.defaultDurationsMin.includes(600) ? (
                <option value={600}>600 min</option>
              ) : null}
            </select>
          </label>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ marginBottom: 8 }}>
            Variações
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {recipe.variations.map((v) => (
              <label key={v.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={selectedVariations.includes(v.id)}
                  onChange={() => toggleVariation(v.id)}
                />
                {v.label}
              </label>
            ))}
          </div>
          <div className="muted" style={{ margin: '12px 0 8px' }}>
            Durações
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {recipe.defaultDurationsMin.map((d) => (
              <label key={d} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={selectedDurations.includes(d)}
                  onChange={() => toggleDuration(d)}
                />
                {d} min
              </label>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            Lote: {batchCount} projeto{batchCount === 1 ? '' : 's'}
          </p>
        </div>
      )}

      <label style={{ display: 'block', marginTop: 16 }}>
        Formato
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as 'youtube' | 'shorts')}
          style={{ width: '100%', marginTop: 6 }}
        >
          <option value="youtube">YouTube 16:9</option>
          <option value="shorts">Shorts 9:16</option>
        </select>
      </label>

      <div className="row" style={{ flexWrap: 'wrap', gap: 16, marginTop: 16 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={autoSearch}
            onChange={(e) => setAutoSearch(e.target.checked)}
          />
          Stock visual
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={generateThumbnail}
            onChange={(e) => setGenerateThumbnail(e.target.checked)}
          />
          Thumbnail
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={generateMetadata}
            onChange={(e) => setGenerateMetadata(e.target.checked)}
          />
          Metadata
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={qualityCheck}
            onChange={(e) => setQualityCheck(e.target.checked)}
          />
          Quality check
        </label>
      </div>

      <button className="primary" type="submit" disabled={busy} style={{ marginTop: 20 }}>
        {busy
          ? 'Criando…'
          : batchMode
            ? `Gerar lote (${batchCount})`
            : 'Gerar preview'}
      </button>
    </form>
  );
}
