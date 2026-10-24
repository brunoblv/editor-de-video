'use client';

import { usePathname } from 'next/navigation';
import { useApi, useSelectedChannel } from './api';

const ITEMS = [
  { href: '/hub', label: 'Visão geral' },
  { href: '/hub/canais', label: 'Canais' },
  { href: '/hub/projetos', label: 'Projetos' },
  { href: '/hub/biblioteca', label: 'Biblioteca' },
  { href: '/hub/calendario', label: 'Calendário' },
  { href: '/hub/fila', label: 'Fila' },
  { href: '/hub/configuracoes', label: 'Configurações' },
];

type Channel = { id: string; name: string; nameConfirmed: boolean };

export function HubNav() {
  const pathname = usePathname();
  const [channel, setChannel] = useSelectedChannel();
  const { data } = useApi<{ channels: Channel[] }>('/api/v3/channels');
  const active = (href: string) => (href === '/hub' ? pathname === '/hub' : pathname.startsWith(href));

  return (
    <nav className="hub-nav" aria-label="Navegação do hub">
      <label className="field" style={{ marginBottom: 8 }}>
        <span>Canal</span>
        <select value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Selecionar canal">
          <option value="">Todos os canais</option>
          {data?.channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.nameConfirmed ? '' : ' (provisório)'}
            </option>
          ))}
        </select>
      </label>
      {ITEMS.map((item) => (
        <a key={item.href} href={item.href} aria-current={active(item.href) ? 'page' : undefined}>
          {item.label}
        </a>
      ))}
      <a href="/" style={{ marginTop: 12, fontSize: 12 }}>
        ← Editor legado
      </a>
    </nav>
  );
}
