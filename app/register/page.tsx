import { redirect } from 'next/navigation';

type SearchParams = Promise<{ ref?: string }>;

/** Short public registration link used by referral shares. */
export default async function RegisterRedirect({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const ref = String(params.ref || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 40);
  redirect(ref ? `/auth/register?ref=${encodeURIComponent(ref)}` : '/auth/register');
}
