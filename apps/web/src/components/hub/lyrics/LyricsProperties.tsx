'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CompositionItem } from '@editor-video/timeline';
import type { LyricsBinding, LyricsPresetInfo, LyricsStudioApi } from './types';
import { CinematicControls, parseScenes, type SceneEntry } from './CinematicControls';

const SECTION_TYPES = ['intro', 'verse', 'pre_chorus', 'chorus', 'bridge', 'solo', 'outro', 'other'] as const;
const SECTION_LABEL: Record<string, string> = { intro: 'Intro', verse: 'Verso', pre_chorus: 'Pré-refrão', chorus: 'Refrão', bridge: 'Ponte', solo: 'Solo', outro: 'Final', other: 'Outra' };
const SOURCE_LABEL: Record<string, string> = { bass: 'Graves', mids: 'Médios', treble: 'Agudos', rms: 'Energia', onset: 'Transientes', beat: 'Batidas' };
const TARGET_LABEL: Record<string, string> = { scale: 'escala', glow: 'brilho', opacity: 'fundo', translate: 'tremor', particles: 'partículas', glitch: 'glitch', bgZoom: 'microzoom do cenário', brightness: 'brilho do cenário' };

type Section = { type: string; startSec: string; endSec: string };

function parseSections(value: unknown): Section[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  return value.split(';').flatMap((part) => {
    const m = /^(\d+)-(\d+):([a-z_]+)$/.exec(part.trim());
    return m ? [{ type: m[3]!, startSec: String(Number(m[1]) / 1000), endSec: String(Number(m[2]) / 1000) }] : [];
  });
}

/**
 * Propriedades visuais da composição: preset, destaque, intensidade,
 * suavização/ganho dos vínculos, acessibilidade, posição, cores e seções.
 * Edita um rascunho local; "Salvar visual" grava UMA revisão.
 */
export function LyricsProperties({ studio, presets, segmentStartMs }: { studio: LyricsStudioApi; presets: LyricsPresetInfo[]; segmentStartMs: number }) {
  const item = useMemo(
    () => studio.doc.tracks.flatMap((t) => t.items).find((i): i is CompositionItem => i.kind === 'composition' && i.templateId === 'reactive-lyrics') ?? null,
    [studio.doc],
  );
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [sections, setSections] = useState<Section[]>([]);
  const [bindings, setBindings] = useState<LyricsBinding[] | null>(null);
  const [scenes, setScenes] = useState<SceneEntry[]>([]);
  useEffect(() => {
    setDraft(item?.params ?? {});
    setSections(parseSections(item?.params.sections));
    setScenes(parseScenes(item?.params.scenes));
    try {
      setBindings(typeof item?.params.bindings === 'string' && item.params.bindings ? (JSON.parse(item.params.bindings) as LyricsBinding[]) : null);
    } catch {
      setBindings(null);
    }
  }, [item]);
  if (!item) return <div className="state">Composição de letra não encontrada na timeline.</div>;

  const presetValue = String(draft.preset ?? 'neon');
  const preset = presets.find((p) => p.templatePreset === presetValue) ?? presets[0];
  const shownBindings = bindings ?? preset?.bindings ?? [];
  const set = (key: string, value: unknown) => setDraft((d) => ({ ...d, [key]: value }));
  const num = (key: string, fallback: number) => (typeof draft[key] === 'number' ? (draft[key] as number) : fallback);
  const bool = (key: string, fallback: boolean) => (typeof draft[key] === 'boolean' ? (draft[key] as boolean) : fallback);

  const changePreset = (value: string) => {
    const p = presets.find((x) => x.templatePreset === value);
    setDraft((d) => ({ ...d, preset: value, ...(p ? p.palette : {}) }));
    setBindings(null);
  };
  const updateBinding = (i: number, patch: Partial<LyricsBinding>) => setBindings(shownBindings.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  const save = async () => {
    // Seções em ms da música (o trecho começa em segmentStartMs).
    const sectionParam = sections
      .filter((s) => s.startSec !== '' && s.endSec !== '')
      .map((s) => `${Math.round(Number(s.startSec) * 1000)}-${Math.round(Number(s.endSec) * 1000)}:${s.type}`)
      .join(';');
    const params: Record<string, unknown> = { ...draft, sections: sectionParam, bindings: bindings ? JSON.stringify(bindings) : '', scenes: scenes.length ? JSON.stringify(scenes) : '' };
    const emptyDefault = new Set(['sections', 'bindings', 'scenes']);
    const changed = Object.fromEntries(
      Object.entries(params).filter(([k, v]) => {
        // `null` remove a chave (asset de cena retirado); só vale se ela existe.
        if (v === null) return k in item.params;
        return JSON.stringify(item.params[k] ?? (emptyDefault.has(k) ? '' : undefined)) !== JSON.stringify(v);
      }),
    );
    if (Object.keys(changed).length === 0) return;
    await studio.apply([{ op: 'updateCompositionParams', itemId: item.id, params: changed }], 'Visual da letra');
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label className="field">
        <span>Preset</span>
        <select value={presetValue} onChange={(e) => changePreset(e.target.value)}>
          {presets.map((p) => <option key={p.id} value={p.templatePreset}>{p.name}</option>)}
        </select>
      </label>
      <div className="grid-2">
        <label className="field">
          <span>Destaque</span>
          <select value={String(draft.highlightMode ?? 'karaoke')} onChange={(e) => set('highlightMode', e.target.value)}>
            <option value="karaoke">Palavra a palavra</option>
            <option value="line">Linha inteira</option>
          </select>
        </label>
        <label className="field">
          <span>Posição</span>
          <select value={String(draft.textPosition ?? 'center')} onChange={(e) => set('textPosition', e.target.value)}>
            <option value="upper">Alto</option>
            <option value="center">Centro</option>
            <option value="lower">Baixo</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Intensidade da reação: {num('intensity', 70)}</span>
        <input type="range" min={0} max={100} value={num('intensity', 70)} onChange={(e) => set('intensity', Number(e.target.value))} />
      </label>
      <label className="field">
        <span>Tamanho da letra: {num('fontScale', 1).toFixed(2)}×</span>
        <input type="range" min={0.6} max={1.6} step={0.05} value={num('fontScale', 1)} onChange={(e) => set('fontScale', Number(e.target.value))} />
      </label>
      <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={bool('reducedMotion', false)} onChange={(e) => set('reducedMotion', e.target.checked)} />Movimento reduzido</label>
      <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={bool('limitFlashes', true)} onChange={(e) => set('limitFlashes', e.target.checked)} />Limitar flashes (máx. 3 por segundo)</label>
      <div className="grid-2">
        {(['accent', 'textColor', 'background'] as const).map((k) => (
          <label key={k} className="field">
            <span>{k === 'accent' ? 'Destaque' : k === 'textColor' ? 'Texto' : 'Fundo'}</span>
            <input type="color" value={String(draft[k] ?? preset?.palette[k] ?? '#ffffff')} onChange={(e) => set(k, e.target.value.toUpperCase())} />
          </label>
        ))}
      </div>
      <label className="field">
        <span>Crédito (artista — faixa)</span>
        <input type="text" maxLength={80} value={String(draft.credit ?? '')} onChange={(e) => set('credit', e.target.value)} />
      </label>

      {presetValue === 'cinematic' && (
        <CinematicControls
          draft={draft}
          set={set}
          setMany={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          scenes={scenes}
          setScenes={setScenes}
          segmentStartMs={segmentStartMs}
          playheadMs={studio.playheadMs}
        />
      )}

      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
        <legend className="muted">Reação ao som {bindings ? '(personalizada)' : '(do preset)'}</legend>
        {shownBindings.map((b, i) => (
          <div key={i} style={{ display: 'grid', gap: 4, marginBottom: 8 }}>
            <label className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={b.enabled} onChange={(e) => updateBinding(i, { enabled: e.target.checked })} />
              <strong>{SOURCE_LABEL[b.source]} → {TARGET_LABEL[b.target]}</strong>
            </label>
            <label className="row" style={{ gap: 6, fontSize: 12 }}>
              Ganho {b.gain.toFixed(2)}
              <input type="range" min={0} max={2} step={0.05} value={b.gain} onChange={(e) => updateBinding(i, { gain: Number(e.target.value) })} />
            </label>
            <label className="row" style={{ gap: 6, fontSize: 12 }}>
              Suavização {b.smoothingMs} ms
              <input type="range" min={0} max={400} step={5} value={b.smoothingMs} onChange={(e) => updateBinding(i, { smoothingMs: Number(e.target.value) })} />
            </label>
          </div>
        ))}
        {bindings && <button className="ghost" onClick={() => setBindings(null)}>Voltar aos valores do preset</button>}
      </fieldset>

      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
        <legend className="muted">Seções (segundos da música; refrão intensifica, verso suaviza)</legend>
        {sections.map((s, i) => (
          <div key={i} className="row" style={{ gap: 4, marginBottom: 4 }}>
            <select value={s.type} onChange={(e) => setSections(sections.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))} aria-label="Tipo da seção">
              {SECTION_TYPES.map((t) => <option key={t} value={t}>{SECTION_LABEL[t]}</option>)}
            </select>
            <input type="number" step={0.1} value={s.startSec} onChange={(e) => setSections(sections.map((x, j) => (j === i ? { ...x, startSec: e.target.value } : x)))} style={{ width: 70 }} aria-label="Início (s)" />
            <input type="number" step={0.1} value={s.endSec} onChange={(e) => setSections(sections.map((x, j) => (j === i ? { ...x, endSec: e.target.value } : x)))} style={{ width: 70 }} aria-label="Fim (s)" />
            <button className="ghost" onClick={() => setSections(sections.filter((_, j) => j !== i))} aria-label="Remover seção">✕</button>
          </div>
        ))}
        <button
          className="ghost"
          onClick={() => {
            const at = (segmentStartMs + studio.playheadMs) / 1000;
            setSections([...sections, { type: 'chorus', startSec: at.toFixed(1), endSec: (at + 10).toFixed(1) }]);
          }}
        >
          + Seção no playhead
        </button>
      </fieldset>

      <button className="primary" onClick={() => void save()}>Salvar visual</button>
    </div>
  );
}
