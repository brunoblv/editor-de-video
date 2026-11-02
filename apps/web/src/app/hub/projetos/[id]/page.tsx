import { Studio } from '@/components/hub/studio/Studio';

export const dynamic = 'force-dynamic';

export default async function StudioPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  return <Studio projectId={id} initialTab={tab} />;
}
