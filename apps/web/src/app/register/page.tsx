import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { RegisterForm } from '@/components/RegisterForm';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect('/');
  }

  return <RegisterForm />;
}
