'use client';

import { useMemo, useState } from 'react';
import { fileUrl } from '@/lib/dto';

export type SoundAssetDTO = {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  provider: string;
  license: string | null;
  licenseVerdict: string;
  durationSec: number;
  qualityScore: number;
  loopScore: number;
  localKey: string;
  tags: string[];
};

const CATEGORIES = [
  'all',
  'rain/light',
  'rain/heavy',
  'rain/window',
  'rain/roof',
  'thunder/distant',
  'thunder/close',
  'fire/fireplace',
  'wind/light',
  'wind/strong',
  'nature/forest',
  'nature/river',
  'ocean/waves',
  'city/rain',
  'room/ambience',
  'noise/white',
  'noise/pink',
  'noise/brown',
];

export function AmbientLibrary({ initialAssets }: { initialAssets: SoundAssetDTO[] }) {
  const [assets, setAssets] = useState(initialAssets);
  const [category, setCategory] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [importCategory, setImportCategory] = useState('rain/heavy');
  const [license, setLicense] = useState('synthetic');
  const [provider, setProvider] = useState('local');
  const [file, setFile] = useState<File | null>(null);

  const filtered = useMemo(() => {
    if (category === 'all') return assets;
    return assets.filter((a) => a.category === category);
  }, [assets, category]);

  async function importSound(): Promise<void> {
    if (!file || name.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('name', name.trim());
      form.set('category', importCategory);
      form.set('license', license);
      form.set('provider', provider);
      const response = await fetch('/api/ambient/library', { method: 'POST', body: form });
      const payload = (await response.json()) as {
        asset?: SoundAssetDTO;
        error?: string;
      };
      if (!response.ok || !payload.asset) {
        throw new Error(payload.error ?? 'Falha ao importar som.');
      }
      setAssets((prev) => [payload.asset!, ...prev]);
      setName('');
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="card">
        <h2>Importar som</h2>
        {error ? <div className="error">{error}</div> : null}
        <div className="grid-2">
          <div>
            <label htmlFor="lib-name">Nome</label>
            <input
              id="lib-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Heavy rain loop 01"
            />
          </div>
          <div>
            <label htmlFor="lib-cat">Categoria</label>
            <select
              id="lib-cat"
              value={importCategory}
              onChange={(e) => setImportCategory(e.target.value)}
            >
              {CATEGORIES.filter((c) => c !== 'all').map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="lib-license">Licença</label>
            <input
              id="lib-license"
              value={license}
              onChange={(e) => setLicense(e.target.value)}
              placeholder="CC0 / Pexels License / synthetic"
            />
          </div>
          <div>
            <label htmlFor="lib-provider">Provider</label>
            <input
              id="lib-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label htmlFor="lib-file">Arquivo de áudio</label>
          <input
            id="lib-file"
            type="file"
            accept="audio/*,.wav,.mp3,.ogg,.flac"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            className="primary"
            type="button"
            disabled={busy || !file || name.trim().length < 2}
            onClick={() => void importSound()}
          >
            {busy ? 'Importando...' : 'Importar para biblioteca'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Biblioteca ({filtered.length})</h2>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c === 'all' ? 'Todas categorias' : c}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="empty" style={{ marginTop: 16 }}>
            Nenhum som ainda. Importe assets seguros ou deixe o motor sintético gerar as camadas.
          </div>
        ) : (
          <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
            {filtered.map((asset) => (
              <div
                key={asset.id}
                className="row"
                style={{
                  justifyContent: 'space-between',
                  borderTop: '1px solid var(--border)',
                  paddingTop: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{asset.name}</div>
                  <div className="muted">
                    {asset.category} · {asset.provider} · {asset.license ?? '—'} ·{' '}
                    {asset.licenseVerdict} · {asset.durationSec.toFixed(1)}s · Q
                    {Math.round(asset.qualityScore)} / L{Math.round(asset.loopScore)}
                  </div>
                  <audio
                    controls
                    src={fileUrl(asset.localKey)}
                    style={{ marginTop: 8, width: '100%', maxWidth: 360 }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
