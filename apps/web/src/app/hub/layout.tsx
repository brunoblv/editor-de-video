import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { HubNav } from '@/components/hub/HubNav';

export const metadata: Metadata = {
  title: 'Hub de canais',
  description: 'Produção audiovisual e distribuição para múltiplos canais.',
};

export default function HubLayout({ children }: { children: ReactNode }) {
  return (
    <div className="hub">
      <HubNav />
      <main className="hub-main">{children}</main>
    </div>
  );
}
