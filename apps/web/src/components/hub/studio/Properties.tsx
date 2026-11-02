'use client';

import { useEffect, useState } from 'react';
import { effectiveTextStyle, effectiveTransform, isLocked, timelineRate, type TimelineItem, type Transform } from '@editor-video/timeline';
import type { StudioApi } from './types';

/** Propriedades da seleção: texto, enquadramento (por variante), áudio, bloqueio. */
export function Properties({ studio }: { studio: StudioApi }) {
  const { doc, variantId } = studio;
  const id = studio.selection[0];
  const item: TimelineItem | undefined = doc.tracks.flatMap((t) => t.items).find((i) => i.id === id);
  const track = doc.tracks.find((t) => t.items.some((i) => i.id === id));
  const [textDraft, setTextDraft] = useState('');
  useEffect(() => {
    if (item && (item.kind === 'text' || item.kind === 'caption')) setTextDraft(item.text);
  }, [item]);

  if (!item || !track) return <div className="state">Selecione um item na timeline para editar suas propriedades.</div>;
  const locked = isLocked(doc, item.id);
  const disabled = studio.readOnly || locked;
  const fps = timelineRate(doc);
  const sec = (f: number) => ((f * fps.den) / fps.num).toFixed(2);
  const transform = effectiveTransform(doc, item, variantId) as Transform | null;
  const variantLabel = variantId ? (doc.variants.find((v) => v.id === variantId)?.label ?? variantId) : 'principal';

  const setTransform = (patch: Partial<Transform>) =>
    void studio.apply([{ op: 'updateTransform', itemId: item.id, ...(variantId ? { variantId } : {}), transform: patch }], `Enquadramento (${variantLabel})`);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <strong>{item.kind}</strong> <span className="muted">{item.id}</span>
        <div className="stat">Trilha {track.id} · {sec(item.timelineStart)}s → {sec(item.timelineStart + item.duration)}s ({sec(item.duration)}s)</div>
        {locked && <div className="notice" style={{ marginTop: 6 }}>Bloqueado: nem você nem o agente alteram este item até desbloquear.</div>}
        <button style={{ marginTop: 6 }} disabled={studio.readOnly || track.locked} onClick={() => void studio.apply([{ op: 'setLock', itemId: item.id, locked: !item.locked }], item.locked ? 'Desbloquear' : 'Bloquear')}>
          {item.locked ? 'Desbloquear' : 'Bloquear'}
        </button>
      </div>

      {(item.kind === 'text' || item.kind === 'caption') && (
        <div className="field">
          <span>{item.kind === 'caption' ? 'Texto da legenda (corrigir texto não corta mídia)' : 'Texto'}</span>
          <textarea rows={3} value={textDraft} disabled={disabled} onChange={(e) => setTextDraft(e.target.value)} />
          <button
            disabled={disabled || textDraft === item.text}
            onClick={() =>
              void studio.apply(
                item.kind === 'caption' ? [{ op: 'updateCaptions', edits: [{ itemId: item.id, text: textDraft }] }] : [{ op: 'updateText', itemId: item.id, text: textDraft }],
                item.kind === 'caption' ? 'Corrigir texto da legenda' : 'Editar texto',
              )
            }
          >
            Corrigir texto
          </button>
        </div>
      )}

      {item.kind === 'caption' && (
        <label className="field">
          <span>Altura das legendas ({variantLabel})</span>
          <input
            type="range"
            min={0.1}
            max={0.95}
            step={0.01}
            disabled={disabled}
            defaultValue={effectiveTextStyle(doc, item, variantId).positionY ?? 0.85}
            onMouseUp={(e) => void studio.apply([{ op: 'updateCaptions', edits: [], style: { trackId: track.id, ...(variantId ? { variantId } : {}), style: { positionY: Number((e.target as HTMLInputElement).value) } } }], 'Posição das legendas')}
          />
        </label>
      )}

      {transform && (
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
          <legend className="muted">Enquadramento — {variantLabel}</legend>
          <div className="grid-2">
            <label className="field"><span>Posição X</span><input type="number" step={0.01} disabled={disabled} defaultValue={transform.positionX} onBlur={(e) => setTransform({ positionX: Number(e.target.value) })} /></label>
            <label className="field"><span>Posição Y</span><input type="number" step={0.01} disabled={disabled} defaultValue={transform.positionY} onBlur={(e) => setTransform({ positionY: Number(e.target.value) })} /></label>
            <label className="field"><span>Escala</span><input type="number" step={0.05} min={0.05} disabled={disabled} defaultValue={transform.scale} onBlur={(e) => setTransform({ scale: Number(e.target.value) })} /></label>
            <label className="field"><span>Opacidade</span><input type="number" step={0.05} min={0} max={1} disabled={disabled} defaultValue={transform.opacity} onBlur={(e) => setTransform({ opacity: Number(e.target.value) })} /></label>
          </div>
          <label className="field">
            <span>Ajuste</span>
            <select disabled={disabled} value={transform.fit} onChange={(e) => setTransform({ fit: e.target.value as 'fit' | 'fill' })}>
              <option value="fit">Caber inteiro (sem esticar)</option>
              <option value="fill">Preencher (cortar excedente)</option>
            </select>
          </label>
          {transform.crop && <div className="stat">Crop: x {transform.crop.x.toFixed(2)} · y {transform.crop.y.toFixed(2)} · {transform.crop.width.toFixed(2)}×{transform.crop.height.toFixed(2)}</div>}
          <button disabled={disabled || !transform.crop} onClick={() => setTransform({ crop: null })}>Remover crop</button>
        </fieldset>
      )}

      {item.kind === 'clip' && (
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
          <legend className="muted">Áudio</legend>
          <label className="field"><span>Volume (dB): {item.audio.gainDb}</span>
            <input type="range" min={-40} max={12} step={1} disabled={disabled} defaultValue={item.audio.gainDb} onMouseUp={(e) => void studio.apply([{ op: 'updateAudio', itemId: item.id, audio: { gainDb: Number((e.target as HTMLInputElement).value) } }], 'Volume')} />
          </label>
          <div className="grid-2">
            <label className="field"><span>Fade in (frames)</span><input type="number" min={0} disabled={disabled} defaultValue={item.audio.fadeInFrames} onBlur={(e) => void studio.apply([{ op: 'updateAudio', itemId: item.id, audio: { fadeInFrames: Number(e.target.value) } }], 'Fade in')} /></label>
            <label className="field"><span>Fade out (frames)</span><input type="number" min={0} disabled={disabled} defaultValue={item.audio.fadeOutFrames} onBlur={(e) => void studio.apply([{ op: 'updateAudio', itemId: item.id, audio: { fadeOutFrames: Number(e.target.value) } }], 'Fade out')} /></label>
          </div>
        </fieldset>
      )}

      {item.kind === 'composition' && (
        <div className="stat">Template {item.templateId}@{item.templateVersion}. Parâmetros: <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(item.params, null, 2)}</pre></div>
      )}
    </div>
  );
}
