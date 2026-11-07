// components/onboarding/OnboardingBrand.tsx
'use client';

import Link from 'next/link';
import Logo from '@/components/LogoIcon';

export default function OnboardingBrand() {
  return (
    <Link
      href="/"
      className="inline-flex rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jade-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-ink-950"
      aria-label="GoodSale home"
    >
      <Logo
        iconSize={36}
        textColorClass="text-ink-950 dark:text-white"
        subtitleColorClass="text-ink-400 dark:text-ink-500"
      />
    </Link>
  );
}
