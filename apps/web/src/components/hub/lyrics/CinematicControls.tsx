'use client';

import { useState } from 'react';

/** Espelho de `sceneEntrySchema` (@editor-video/domain): o cliente não importa o domínio Node. */
export type SceneEntry = { file?: string; atmosphere?: string; startMs?: number; endMs?: number; label?: string };

const ATMOSPHERE_LABEL: Record<string, string> = {
  ocean: 'Oceano e rochas',
  rose_moon: 'Lua rosa sobre a água',
  fog_city: 'Cidade na névoa',
  cosmos: 'Cosmos e planeta',
  ember: 'Brasa e dourado',
  storm: 'Céu dramático',
};
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function parseScenes(value: unknown): SceneEntry[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as SceneEntry[]) : [];
  } catch {
    return [];
  }
}

type Props = {
  draft: Record<string, unknown>;
  set: (key: string, value: unknown) => void;
  setMany: (patch: Record<string, unknown>) => void;
  scenes: SceneEntry[];
  setScenes: (scenes: SceneEntry[]) => void;
  segmentStartMs: number;
  playheadMs: number;
};

/**
 * Controles do preset Cinematic Atmospheric: exibição da letra, destaque,
 * transições, cenário (movimento, vinheta, reação) e cenas. Imagens de cena
 * entram como asset com licença declarada; sem cenas, o template usa
 * atmosferas procedurais (sem mídia de terceiros).
 */
export function CinematicControls({ draft, set, setMany, scenes, setScenes, segmentStartMs, playheadMs }: Props) {
  const [license, setLicense] = useState('');
  const [author, setAuthor] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const num = (key: string, fallback: number) => (typeof draft[key] === 'number' ? (draft[key] as number) : fallback);
  const str = (key: string, fallback: string) => (typeof draft[key] === 'string' ? (draft[key] as string) : fallback);
  const bool = (key: string, fallback: boolean) => (typeof draft[key] === 'boolean' ? (draft[key] as boolean) : fallback);
  const manual = str('sceneChangePolicy', 'by_phrase') === 'manual';

  const uploadScene = async (file: File) => {
    if (!IMAGE_TYPES.has(file.type)) {
      setError('Use JPG, PNG ou WebP.');
      return;
    }
    if (!license.trim()) {
      setError('Informe a licença da imagem (ex.: própria, CC BY 4.0, banco licenciado).');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ name: file.name, analyze: '0', license: license.trim() });
      if (author.trim()) qs.set('author', author.trim());
      qs.append('tag', 'lyrics-scene');
      const res = await fetch(`/api/v3/assets/uploads?${qs}`, { method: 'POST', body: file, headers: { 'content-type': file.type } });
      const data = (await res.json()) as { asset?: { id: string; originalName: string }; error?: string };
      if (!res.ok || !data.asset) throw new Error(data.error ?? `Falha no upload (${res.status})`);
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `assets/scenes/${data.asset.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)}.${ext}`;
      const entry: SceneEntry = { file: path, label: data.asset.originalName.slice(0, 80) };
      if (manual) entry.startMs = Math.round(segmentStartMs + playheadMs);
      setMany({ [`$file:${path}`]: data.asset.id });
      setScenes([...scenes, entry]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const remove = (i: number) => {
    const gone = scenes[i]!;
    const rest = scenes.filter((_, j) => j !== i);
    if (gone.file && !rest.some((s) => s.file === gone.file)) setMany({ [`$file:${gone.file}`]: null });
    setScenes(rest);
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= scenes.length) return;
    const next = [...scenes];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setScenes(next);
  };
  const patchScene = (i: number, patch: Partial<SceneEntry>) => setScenes(scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <>
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8, display: 'grid', gap: 8 }}>
        <legend className="muted">Letra (Cinematic)</legend>
        <div className="grid-2">
          <label className="field">
            <span>Exibição</span>
            <select value={str('lyricDisplayMode', 'hybrid')} onChange={(e) => set('lyricDisplayMode', e.target.value)}>
              <option value="hybrid">Híbrido (frase + destaque sozinho)</option>
              <option value="phrase">Frase</option>
              <option value="word">Palavra</option>
            </select>
          </label>
          <label className="field">
            <span>Transição</span>
            <select value={str('textTransition', 'blur')} onChange={(e) => set('textTransition', e.target.value)}>
              <option value="blur">Desfoque</option>
              <option value="fade">Fade</option>
              <option value="scale">Escala</option>
              <option value="slide">Deslize</option>
            </select>
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            <span>Palavras por fragmento: {num('maxWordsPerGroup', 4)}</span>
            <input type="range" min={1} max={8} step={1} value={num('maxWordsPerGroup', 4)} onChange={(e) => set('maxWordsPerGroup', Number(e.target.value))} />
          </label>
          <label className="field">
            <span>Linhas: {num('maxLines', 3)}</span>
            <input type="range" min={1} max={3} step={1} value={num('maxLines', 3)} onChange={(e) => set('maxLines', Number(e.target.value))} />
          </label>
        </div>
        <label className="field">
          <span>Duração da transição: {num('textTransitionFrames', 8)} frames</span>
          <input type="range" min={2} max={30} step={1} value={num('textTransitionFrames', 8)} onChange={(e) => set('textTransitionFrames', Number(e.target.value))} />
        </label>
        <label className="field">
          <span>Palavras de destaque (vírgula)</span>
          <input type="text" maxLength={1000} placeholder="ex.: coração, mar, nunca" value={str('emphasisWords', '')} onChange={(e) => set('emphasisWords', e.target.value)} />
        </label>
        <label className="field">
          <span>Escala do destaque: {num('emphasisScale', 1.4).toFixed(2)}×</span>
          <input type="range" min={1} max={2} step={0.05} value={num('emphasisScale', 1.4)} onChange={(e) => set('emphasisScale', Number(e.target.value))} />
        </label>
        <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={bool('autoEmphasis', true)} onChange={(e) => set('autoEmphasis', e.target.checked)} />Destacar notas sustentadas</label>
        <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={bool('uppercase', true)} onChange={(e) => set('uppercase', e.target.checked)} />Maiúsculas</label>
      </fieldset>

      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8, display: 'grid', gap: 8 }}>
        <legend className="muted">Cenário</legend>
        <div className="grid-2">
          <label className="field">
            <span>Movimento</span>
            <select value={str('backgroundMotion', 'slow_zoom')} onChange={(e) => set('backgroundMotion', e.target.value)}>
              <option value="slow_zoom">Zoom lento</option>
              <option value="pan">Pan lento</option>
              <option value="parallax_if_available">Parallax (atmosferas; imagem usa zoom)</option>
              <option value="none">Nenhum</option>
            </select>
          </label>
          <label className="field">
            <span>Passagem de cena</span>
            <select value={str('sceneTransition', 'crossfade')} onChange={(e) => set('sceneTransition', e.target.value)}>
              <option value="crossfade">Dissolve</option>
              <option value="cut">Corte</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Vinheta de contraste: {num('contrastOverlayStrength', 45)}</span>
          <input type="range" min={0} max={100} value={num('contrastOverlayStrength', 45)} onChange={(e) => set('contrastOverlayStrength', Number(e.target.value))} />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Reação do cenário: {num('backgroundAudioReactivity', 100)}</span>
            <input type="range" min={0} max={100} value={num('backgroundAudioReactivity', 100)} onChange={(e) => set('backgroundAudioReactivity', Number(e.target.value))} />
          </label>
          <label className="field">
            <span>Reação da letra: {num('textAudioReactivity', 100)}</span>
            <input type="range" min={0} max={100} value={num('textAudioReactivity', 100)} onChange={(e) => set('textAudioReactivity', Number(e.target.value))} />
          </label>
        </div>
      </fieldset>

      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8, display: 'grid', gap: 8 }}>
        <legend className="muted">Cenas {scenes.length === 0 ? '(vazio: atmosferas padrão)' : `(${scenes.length})`}</legend>
        <div className="grid-2">
          <label className="field">
            <span>Troca de cena</span>
            <select value={str('sceneChangePolicy', 'by_phrase')} onChange={(e) => set('sceneChangePolicy', e.target.value)}>
              <option value="by_phrase">Por frase</option>
              <option value="by_section">Por seção</option>
              <option value="ai_suggested">Sugerida pelo mapa musical</option>
              <option value="manual">Manual (início de cada cena)</option>
            </select>
          </label>
          <label className="field">
            <span>Cena mínima: {num('minSceneSec', 6)} s</span>
            <input type="range" min={2} max={30} step={0.5} value={num('minSceneSec', 6)} onChange={(e) => set('minSceneSec', Number(e.target.value))} disabled={manual} />
          </label>
        </div>
        {scenes.map((s, i) => (
          <div key={i} className="row" style={{ gap: 4, alignItems: 'center' }}>
            <span style={{ flex: 1, fontSize: 12 }}>{i + 1}. {s.file ? `🖼 ${s.label ?? s.file}` : ATMOSPHERE_LABEL[s.atmosphere ?? ''] ?? s.atmosphere}</span>
            {manual && (
              <input
                type="number"
                step={0.1}
                style={{ width: 70 }}
                aria-label="Início (s da música)"
                value={s.startMs !== undefined ? s.startMs / 1000 : ''}
                onChange={(e) => patchScene(i, { startMs: e.target.value === '' ? undefined : Math.max(0, Math.round(Number(e.target.value) * 1000)) })}
              />
            )}
            <button className="ghost" onClick={() => move(i, -1)} aria-label="Subir">↑</button>
            <button className="ghost" onClick={() => move(i, 1)} aria-label="Descer">↓</button>
            <button className="ghost" onClick={() => remove(i)} aria-label="Remover cena">✕</button>
          </div>
        ))}
        <div className="row" style={{ gap: 4 }}>
          <select
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              const entry: SceneEntry = { atmosphere: e.target.value };
              if (manual) entry.startMs = Math.round(segmentStartMs + playheadMs);
              setScenes([...scenes, entry]);
            }}
            aria-label="Adicionar atmosfera"
          >
            <option value="">+ Atmosfera procedural…</option>
            {Object.entries(ATMOSPHERE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="grid-2">
          <label className="field"><span>Licença da imagem</span><input type="text" value={license} onChange={(e) => setLicense(e.target.value)} placeholder="obrigatória" /></label>
          <label className="field"><span>Autor</span><input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} /></label>
        </div>
        <label className="field">
          <span>{uploading ? 'Enviando…' : '+ Imagem de cena (JPG/PNG/WebP com direitos de uso)'}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadScene(f); e.target.value = ''; }} />
        </label>
        {error && <div className="state error">{error}</div>}
        {manual && <div className="muted" style={{ fontSize: 12 }}>Manual: cada cena começa no instante informado (segundos da música) e vai até a próxima.</div>}
      </fieldset>
    </>
  );
}
