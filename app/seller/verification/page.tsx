import type { Metadata } from 'next';
import SellerVerificationCenter from '@/components/seller/SellerVerificationCenter';

export const metadata: Metadata = {
  title: 'Seller verification',
  description: 'Apply for GoodSale Verified and track your verification review.',
  robots: { index: false, follow: false },
};

export default function SellerVerificationPage() {
  return <SellerVerificationCenter />;
}
