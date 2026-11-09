'use client';

import { useState } from 'react';
import { api, describeError, useApi } from '../api';
import { formatMs, type LyricsPresetInfo } from './types';
import { YoutubePicker } from './YoutubePicker';

type Channel = { id: string; name: string };
type UploadedAudio = { id: string; originalName: string; durationSec: number | null };

/**
 * Novo projeto Reactive Lyrics: música (MP3/WAV/FLAC), letra (arquivo ou
 * texto colado), trecho, formatos, preset e declaração de direitos.
 */
export function NewLyricsProject({ channels, defaultChannelId }: { channels: Channel[]; defaultChannelId: string }) {
  const meta = useApi<{ presets: LyricsPresetInfo[]; limits: { maxAudioSec: number; audioExtensions: string[] } }>('/api/v3/lyrics/projects');
  const [channelId, setChannelId] = useState(defaultChannelId);
  const [title, setTitle] = useState('');
  const [audio, setAudio] = useState<UploadedAudio | null>(null);
  const [uploading, setUploading] = useState(false);
  const [source, setSource] = useState<'file' | 'youtube'>('file');
  const [lyrics, setLyrics] = useState({ content: '', fileName: null as string | null });
  const [autoLyrics, setAutoLyrics] = useState(true);
  const [language, setLanguage] = useState('pt-BR');
  const [formats, setFormats] = useState<string[]>(['9:16']);
  const [presetId, setPresetId] = useState('CINEMATIC_ATMOSPHERIC_LYRICS');
  const [startSec, setStartSec] = useState('0');
  const [durationSec, setDurationSec] = useState('30');
  const [credit, setCredit] = useState('');
  const [rights, setRights] = useState({ declared: false, note: '', author: '', license: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ name: file.name, analyze: '0' });
      if (rights.author) qs.set('author', rights.author);
      if (rights.license) qs.set('license', rights.license);
      const res = await fetch(`/api/v3/assets/uploads?${qs}`, { method: 'POST', body: file, headers: { 'content-type': file.type || 'application/octet-stream' } });
      const data = (await res.json()) as { asset?: UploadedAudio; error?: string };
      if (!res.ok || !data.asset) throw new Error(data.error ?? `Falha no upload (${res.status})`);
      setAudio(data.asset);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
      const total = data.asset.durationSec ?? 0;
      setDurationSec(String(Math.min(30, Math.floor(total))));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const create = async () => {
    if (!audio) return;
    setBusy(true);
    setError(null);
    try {
      const { project } = await api<{ project: { id: string } }>('/api/v3/lyrics/projects', {
        method: 'POST',
        json: {
          channelId,
          title,
          formats,
          audioAssetId: audio.id,
          lyrics: lyrics.content.trim() ? { content: lyrics.content, fileName: lyrics.fileName } : null,
          autoLyrics: !lyrics.content.trim() && autoLyrics,
          language: language || null,
          presetId,
          segmentStartMs: Math.round(Number(startSec) * 1000),
          segmentDurationMs: Math.round(Number(durationSec) * 1000),
          credit: credit || null,
          rights: { declared: rights.declared, note: rights.note || null },
        },
      });
      window.location.href = `/hub/projetos/${project.id}`;
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  };

  const extensions = meta.data?.limits.audioExtensions.join(',') ?? '.mp3,.wav,.flac';
  return (
    <section className="card" style={{ display: 'grid', gap: 10 }} aria-label="Novo projeto Reactive Lyrics">
      <strong>Novo Reactive Lyrics</strong>
      <span className="muted" style={{ fontSize: 13 }}>Use só músicas e letras que você pode usar. Nada é buscado na internet nem publicado automaticamente.</span>
      <div className="grid-2">
        <label className="field">
          <span>Canal</span>
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            <option value="">Selecione…</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Título</span><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      </div>
      <div className="tabs" role="tablist" aria-label="Origem da música">
        <button role="tab" aria-selected={source === 'file'} onClick={() => setSource('file')}>Enviar arquivo</button>
        <button role="tab" aria-selected={source === 'youtube'} onClick={() => setSource('youtube')}>Buscar no YouTube</button>
      </div>
      {source === 'file' ? (
        <label className="field">
          <span>Música ({extensions.replace(/\./g, '').toUpperCase()}, até {meta.data?.limits.maxAudioSec ?? 600} s)</span>
          <input type="file" accept={extensions} disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          {uploading && <span className="muted">Enviando e conferindo o áudio…</span>}
        </label>
      ) : (
        <YoutubePicker
          maxDurationSec={meta.data?.limits.maxAudioSec ?? 600}
          onPicked={(p) => {
            setAudio(p.asset);
            if (!title) setTitle(p.title);
            if (!credit && p.channel) setCredit(`${p.channel} — ${p.title}`.slice(0, 80));
            setStartSec(p.startSec.toFixed(1));
            setDurationSec((p.endSec - p.startSec).toFixed(1));
            setRights((r) => ({ ...r, declared: true, note: p.rightsNote || r.note || 'Declarado ao baixar do YouTube' }));
          }}
        />
      )}
      {audio && <span className="muted">✓ Áudio: {audio.originalName} · {formatMs((audio.durationSec ?? 0) * 1000)}</span>}
      <label className="field">
        <span>Letra (TXT, LRC, SRT ou VTT) — LRC/SRT/VTT trazem os tempos; TXT exige sincronizar no estúdio</span>
        <input type="file" accept=".txt,.lrc,.srt,.vtt" onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then((content) => setLyrics({ content, fileName: f.name })); }} />
        <textarea rows={6} value={lyrics.content} onChange={(e) => setLyrics({ content: e.target.value, fileName: lyrics.fileName })} placeholder="Ou cole a letra aqui" />
      </label>
      {!lyrics.content.trim() && (
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={autoLyrics} onChange={(e) => setAutoLyrics(e.target.checked)} />
          Sem letra? Transcrever automaticamente com Whisper (local e gratuito). Entra como sugestão para você revisar.
        </label>
      )}
      <div className="grid-2">
        <label className="field"><span>Início do trecho (s)</span><input type="number" min={0} step={0.1} value={startSec} onChange={(e) => setStartSec(e.target.value)} /></label>
        <label className="field"><span>Duração do trecho (s)</span><input type="number" min={1} step={0.1} value={durationSec} onChange={(e) => setDurationSec(e.target.value)} /></label>
      </div>
      <div className="grid-2">
        <label className="field">
          <span>Preset</span>
          <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
            {(meta.data?.presets ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Idioma</span><input type="text" value={language} onChange={(e) => setLanguage(e.target.value)} /></label>
      </div>
      <fieldset style={{ border: 'none', padding: 0 }}>
        <legend className="muted">Formatos (o primeiro é o principal)</legend>
        <div className="row" style={{ gap: 12 }}>
          {['9:16', '16:9'].map((f) => (
            <label key={f} className="row" style={{ gap: 4 }}>
              <input type="checkbox" checked={formats.includes(f)} onChange={(e) => setFormats(e.target.checked ? [...formats, f] : formats.filter((x) => x !== f))} />
              {f}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field"><span>Crédito na tela (opcional)</span><input type="text" maxLength={80} value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="Artista — Faixa" /></label>
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8, display: 'grid', gap: 6 }}>
        <legend className="muted">Direitos</legend>
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={rights.declared} onChange={(e) => setRights({ ...rights, declared: e.target.checked })} />
          Declaro que tenho autorização para usar este áudio e esta letra (exigido para o render final)
        </label>
        <input type="text" placeholder="Origem/licença (ex.: faixa própria, licença X)" value={rights.note} onChange={(e) => setRights({ ...rights, note: e.target.value })} />
      </fieldset>
      {error && <div className="notice" data-tone="err" role="alert">{error}</div>}
      <div>
        <button className="primary" disabled={busy || uploading || !audio || !title || !channelId || (!lyrics.content.trim() && !autoLyrics) || formats.length === 0} onClick={() => void create()}>
          {busy ? 'Criando…' : 'Criar e abrir o estúdio'}
        </button>
      </div>
    </section>
  );
}
