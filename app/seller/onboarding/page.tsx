import type { Metadata } from 'next';
import SellerOnboardingFlow from '@/components/onboarding/SellerOnboardingFlow';

export const metadata: Metadata = {
  title: 'Set up your store',
  description: 'Open your GoodSale store and start listing products.',
  robots: { index: false, follow: false },
};

export default function SellerOnboardingPage() {
  return <SellerOnboardingFlow />;
}
