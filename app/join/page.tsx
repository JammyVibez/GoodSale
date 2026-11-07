import { redirect } from 'next/navigation';

type SearchParams = Promise<{ ref?: string }>;

/** Legacy GoodSale invite link kept working for already-shared URLs. */
export default async function JoinRedirect({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const ref = String(params.ref || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 40);
  redirect(ref ? `/auth/register?ref=${encodeURIComponent(ref)}` : '/auth/register');
}
