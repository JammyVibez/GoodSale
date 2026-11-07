import type { Metadata } from 'next';
import AuthExperience from '@/components/auth/AuthExperience';
import { safeNextPath } from '@/lib/auth/redirects';

export const metadata: Metadata = {
  title: 'Create your account',
  description:
    'Create a GoodSale account to buy and sell across Nigeria with escrow-protected payments and tracked delivery.',
  robots: { index: false, follow: true },
};

type SearchParams = Promise<{ next?: string }>;

export default async function RegisterPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  return (
    <AuthExperience
      initialMode="register"
      next={params.next ? safeNextPath(params.next) : undefined}
    />
  );
}
