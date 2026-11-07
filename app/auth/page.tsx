import type { Metadata } from 'next';
import AuthExperience from '@/components/auth/AuthExperience';
import { safeNextPath } from '@/lib/auth/redirects';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to GoodSale to shop with escrow protection or manage your store.',
  robots: { index: false, follow: true },
};

type SearchParams = Promise<{ mode?: string; next?: string; ref?: string }>;

export default async function AuthPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const mode = params.mode === 'reset' || params.mode === 'forgot' ? params.mode : 'login';

  return (
    <AuthExperience
      initialMode={mode}
      next={params.next ? safeNextPath(params.next) : undefined}
      referralCode={params.ref}
    />
  );
}
