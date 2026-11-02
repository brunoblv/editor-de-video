'use client';

import { useRef, useState } from 'react';
import { api, formatDuration } from '@/components/hub/api';
import { MediaThumb } from './MediaThumb';
import { errorText, fileUrl, uploadToChannel, type MediaAsset } from './shared';

const FILTERS = { '': 'Todas', IMAGE: 'Imagens', VIDEO: 'Vídeos', AUDIO: 'Áudios' } as const;

type Props = { channelId: string; assets: MediaAsset[] | null; reload: () => Promise<void> };

export function MediaTab({ channelId, assets, reload }: Props) {
  const [filter, setFilter] = useState<keyof typeof FILTERS>('');
  const [uploads, setUploads] = useState<Array<{ name: string; status: string; tone: 'ok' | 'err' | 'warn' }>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (files: File[]) => {
    for (const file of files) {
      const set = (status: string, tone: 'ok' | 'err' | 'warn') => setUploads((u) => [...u.filter((x) => x.name !== file.name), { name: file.name, status, tone }]);
      set('Enviando…', 'warn');
      try {
        await uploadToChannel(channelId, file);
        set('Enviado', 'ok');
        await reload();
      } catch (err) {
        set(errorText(err), 'err');
      }
    }
  };

  const remove = async (asset: MediaAsset) => {
    try {
      await api(`/api/v3/channels/${channelId}/media/${asset.id}`, { method: 'DELETE' });
      setMessage(null);
      await reload();
    } catch (err) {
      setMessage(errorText(err));
    }
  };

  const visible = assets?.filter((a) => !filter || a.kind === filter) ?? [];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value as keyof typeof FILTERS)} aria-label="Tipo de mídia" style={{ width: 'auto' }}>
          {Object.entries(FILTERS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button className="primary" onClick={() => input.current?.click()}>Enviar arquivos</button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept="image/png,image/jpeg,image/webp,video/*,audio/*"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            void upload(files);
          }}
        />
      </div>
      {uploads.map((u) => <div key={u.name} className="notice" data-tone={u.tone} role="status">{u.name}: {u.status}</div>)}
      {message && <div className="notice" data-tone="err" role="alert">{message}</div>}
      {assets && visible.length === 0 && <div className="state">Nenhuma mídia aqui ainda. Envie imagens, vídeos ou áudios deste canal.</div>}
      <div className="media-grid">
        {visible.map((asset) => (
          <article key={asset.id} className="media-tile">
            <MediaThumb asset={asset} />
            <div className="name" title={asset.originalName}>{asset.originalName}</div>
            <div className="stat">{asset.width ? `${asset.width}×${asset.height}` : ''}{asset.durationSec ? ` ${formatDuration(asset.durationSec)}` : ''}</div>
            {asset.status !== 'READY' && <span className="chip" data-tone="err">arquivo indisponível</span>}
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <a href={fileUrl(asset)} download={asset.originalName}>Baixar</a>
              <button onClick={() => void remove(asset)} aria-label={`Remover ${asset.originalName} do canal`}>Remover</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
