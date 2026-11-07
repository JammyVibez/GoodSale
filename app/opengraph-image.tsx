import { ogContentType, ogSize, renderOgImage } from '@/lib/seo/og';

export const alt = 'GoodSale — Nigeria’s escrow-protected marketplace';
export const size = ogSize;
export const contentType = ogContentType;

export default function OpengraphImage() {
  return renderOgImage(
    'Shop Nigeria’s escrow-protected marketplace',
    'Verified sellers, real reviews and protected payments on GoodSale.'
  );
}
