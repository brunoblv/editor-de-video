import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { auth } from '@/auth';
import { LoginForm } from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect('/');
  }

  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
