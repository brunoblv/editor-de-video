'use client';

import { use, useEffect, useState } from 'react';
import { useApi, useSelectedChannel } from '@/components/hub/api';
import { AgendaTab } from '@/components/hub/midias/AgendaTab';
import { MediaTab } from '@/components/hub/midias/MediaTab';
import type { MediaAsset } from '@/components/hub/midias/shared';

const TABS = ['Agenda', 'Mídias'] as const;

export default function ChannelMediaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [, setSelected] = useSelectedChannel();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Agenda');
  const channel = useApi<{ channel: { name: string } }>(`/api/v3/channels/${id}`);
  const media = useApi<{ assets: MediaAsset[] }>(`/api/v3/channels/${id}/media`);

  useEffect(() => setSelected(id), [id, setSelected]);

  if (channel.error) return <div className="notice" data-tone="err" role="alert">{channel.error}</div>;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="stat"><a href="/hub/midias">Central de mídias</a> /</div>
      <h1 style={{ margin: 0 }}>{channel.data?.channel.name ?? ' '}</h1>
      <div className="tabs" role="tablist">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {media.error && <div className="notice" data-tone="err" role="alert">{media.error}</div>}
      {tab === 'Agenda' && <AgendaTab channelId={id} media={media.data?.assets ?? []} reloadMedia={media.reload} />}
      {tab === 'Mídias' && <MediaTab channelId={id} assets={media.data?.assets ?? null} reload={media.reload} />}
    </div>
  );
}
