'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/components/hub/api';
import { MediaThumb } from './MediaThumb';
import { errorText, fileUrl, inputToIso, isoToInput, PLATFORMS, uploadToChannel, type MediaAsset, type Platform, type SocialPost } from './shared';

type Props = {
  channelId: string;
  /** null = post novo. */
  post: SocialPost | null;
  defaultWhen: string;
  media: MediaAsset[];
  reloadMedia: () => Promise<void>;
  onClose: () => void;
  onChanged: () => Promise<void>;
};

export function PostDialog({ channelId, post, defaultWhen, media, reloadMedia, onClose, onChanged }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState(post);
  const [title, setTitle] = useState(post?.title ?? '');
  const [caption, setCaption] = useState(post?.caption ?? '');
  const [notes, setNotes] = useState(post?.notes ?? '');
  const [platforms, setPlatforms] = useState<Platform[]>(post?.targets.map((t) => t.platform) ?? []);
  const [assetIds, setAssetIds] = useState<string[]>(post?.media.map((m) => m.asset.id) ?? []);
  const [when, setWhen] = useState(post?.scheduledAt ? isoToInput(post.scheduledAt) : defaultWhen);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const postedSomewhere = Boolean(current?.targets.some((t) => t.postedAt));
  const editable = !current || (['DRAFT', 'SCHEDULED'].includes(current.state) && !postedSomewhere);

  const run = async (fn: () => Promise<void>, success?: string) => {
    setBusy(true);
    try {
      await fn();
      setMessage(success ? { tone: 'ok', text: success } : null);
      await onChanged();
    } catch (err) {
      setMessage({ tone: 'err', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  /** Grava o conteúdo; o horário só muda pela ação de agendar. */
  const saveContent = async (): Promise<string> => {
    const json = { title: title || null, caption, notes: notes || null, platforms, assetIds };
    const { post: saved } = current
      ? await api<{ post: SocialPost }>(`/api/v3/social-posts/${current.id}`, { method: 'PATCH', json })
      : await api<{ post: SocialPost }>(`/api/v3/channels/${channelId}/posts`, { method: 'POST', json });
    setCurrent(saved);
    return saved.id;
  };

  const act = async (id: string, json: Record<string, unknown>) => {
    const { post: saved } = await api<{ post: SocialPost }>(`/api/v3/social-posts/${id}`, { method: 'POST', json });
    setCurrent(saved);
    return saved;
  };

  const schedule = () =>
    run(async () => {
      if (!when) throw new Error('Escolha a data e a hora.');
      await act(await saveContent(), { action: 'schedule', scheduledAt: inputToIso(when) });
    }, 'Post na agenda.');

  const mark = (platform: Platform, posted: boolean) =>
    run(async () => {
      const remoteUrl = posted ? urls[platform]?.trim() || null : null;
      if (remoteUrl && !/^https?:\/\//i.test(remoteUrl)) throw new Error('O link do post precisa começar com http:// ou https://.');
      await act(current!.id, { action: 'mark', platform, posted, remoteUrl });
    });

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      setMessage({ tone: 'ok', text: 'Legenda copiada.' });
    } catch {
      setMessage({ tone: 'err', text: 'O navegador bloqueou a cópia; selecione o texto da legenda.' });
    }
  };

  const addFiles = (files: File[]) =>
    run(async () => {
      for (const file of files) await uploadToChannel(channelId, file);
      await reloadMedia();
    });

  const togglePlatform = (p: Platform) => setPlatforms((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]));
  const toggleAsset = (id: string) => setAssetIds((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  // Áudio fica na central, mas post leva só imagem e vídeo.
  const pickable = media.filter((a) => a.kind === 'IMAGE' || a.kind === 'VIDEO');
  const selected = assetIds.map((id) => current?.media.find((m) => m.asset.id === id)?.asset ?? media.find((a) => a.id === id)).filter((a): a is MediaAsset => Boolean(a));

  return (
    <dialog ref={dialog} className="post-dialog" onClose={onClose} aria-label={current ? 'Editar post' : 'Novo post'}>
      <div className="stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>{current ? 'Post' : 'Novo post'}</h2>
          <button onClick={() => dialog.current?.close()} aria-label="Fechar">✕</button>
        </div>

        <div className="stack" role="group" aria-label="Redes">
          <div className="platform-checks">
            {(Object.keys(PLATFORMS) as Platform[]).map((p) => (
              <label key={p}><input type="checkbox" checked={platforms.includes(p)} disabled={!editable} onChange={() => togglePlatform(p)} /> {PLATFORMS[p]}</label>
            ))}
          </div>
        </div>

        <label className="field"><span>Título (obrigatório para YouTube)</span><input type="text" value={title} maxLength={200} disabled={!editable} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field">
          <span>Legenda ({caption.length} caracteres)</span>
          <textarea rows={6} value={caption} readOnly={!editable} onChange={(e) => setCaption(e.target.value)} />
        </label>
        <label className="field"><span>Anotações internas (não vão para a rede)</span><textarea rows={2} value={notes} readOnly={!editable} onChange={(e) => setNotes(e.target.value)} /></label>

        {editable ? (
          <div className="stack">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <strong>Mídia do post</strong>
              <button onClick={() => fileInput.current?.click()} disabled={busy}>Enviar arquivos</button>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                accept="image/png,image/jpeg,image/webp,video/*"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  void addFiles(files);
                }}
              />
            </div>
            {pickable.length === 0 && <div className="state">Nenhuma imagem ou vídeo neste canal ainda.</div>}
            <div className="media-grid">
              {pickable.map((asset) => {
                const order = assetIds.indexOf(asset.id);
                return (
                  <button key={asset.id} type="button" className="media-tile" aria-pressed={order >= 0} onClick={() => toggleAsset(asset.id)} title={asset.originalName}>
                    {order >= 0 && <span className="media-order">{order + 1}</span>}
                    <MediaThumb asset={asset} />
                    <span className="name">{asset.originalName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="media-grid">
            {selected.map((asset) => <div key={asset.id} className="media-tile"><MediaThumb asset={asset} /><span className="name">{asset.originalName}</span></div>)}
          </div>
        )}

        {editable && (
          <label className="field"><span>Data e hora (Brasília)</span><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
        )}

        {current && current.state !== 'DRAFT' && current.state !== 'CANCELLED' && (
          <section className="stack" aria-label="Postagem manual">
            <strong>Postar</strong>
            <p className="stat" style={{ margin: 0 }}>A postagem é manual: baixe a mídia, copie a legenda, publique na rede e marque aqui.</p>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => void copyCaption()}>Copiar legenda</button>
              {selected.map((asset) => <a key={asset.id} href={fileUrl(asset)} download={asset.originalName}>Baixar {asset.originalName}</a>)}
            </div>
            <div>
              {current.targets.map((target) => (
                <div key={target.platform} className="target-row">
                  <strong>{PLATFORMS[target.platform]}</strong>
                  {target.postedAt ? (
                    <>
                      <span className="chip" data-tone="ok">postado</span>
                      {target.remoteUrl && <a href={target.remoteUrl} target="_blank" rel="noreferrer">abrir post</a>}
                      <button onClick={() => void mark(target.platform, false)} disabled={busy}>Desmarcar</button>
                    </>
                  ) : (
                    <>
                      <input type="url" placeholder="Link do post (opcional)" aria-label={`Link do post em ${PLATFORMS[target.platform]}`} value={urls[target.platform] ?? ''} onChange={(e) => setUrls({ ...urls, [target.platform]: e.target.value })} />
                      <button className="primary" onClick={() => void mark(target.platform, true)} disabled={busy}>Marcar como postado</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {message && <div className="notice" data-tone={message.tone} role={message.tone === 'err' ? 'alert' : 'status'}>{message.text}</div>}

        {editable && (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="primary" onClick={() => void schedule()} disabled={busy}>{current?.state === 'SCHEDULED' ? 'Salvar e manter na agenda' : 'Agendar'}</button>
            {current?.state !== 'SCHEDULED' && <button onClick={() => void run(async () => void (await saveContent()), 'Rascunho salvo.')} disabled={busy}>Salvar rascunho</button>}
            {current?.state === 'SCHEDULED' && <button onClick={() => void run(async () => void (await act(current.id, { action: 'unschedule' })), 'Voltou para rascunho.')} disabled={busy}>Tirar da agenda</button>}
            {current && (
              <button
                onClick={() =>
                  void run(async () => {
                    await act(current.id, { action: 'cancel' });
                    dialog.current?.close();
                  })
                }
                disabled={busy}
              >
                {current.state === 'SCHEDULED' ? 'Cancelar post' : 'Descartar rascunho'}
              </button>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}
