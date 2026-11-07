import Link from 'next/link';
import VerifiedBadge from '@/components/verification/VerifiedBadge';
import { naira } from '@/lib/seo/site';
import type { SeoProduct } from '@/lib/seo/data';

export function RatingStars({ rating, count }: { rating: number | null; count: number }) {
  if (rating === null || count === 0) return null;
  const rounded = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-950/70" aria-label={`Rated ${rating} out of 5 from ${count} reviews`}>
      <span aria-hidden="true" className="text-[#b8912c]">
        {'★'.repeat(rounded)}
        <span className="text-emerald-950/20">{'★'.repeat(5 - rounded)}</span>
      </span>
      <span>{rating.toFixed(1)}</span>
      <span>({count})</span>
    </span>
  );
}

export function ProductCard({ product, eager = false }: { product: SeoProduct; eager?: boolean }) {
  const image = product.images[0];
  const discount =
    product.compareAtPrice && product.compareAtPrice > product.price
      ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
      : 0;

  return (
    <article className="group overflow-hidden rounded-2xl border border-emerald-950/10 bg-white transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-950/5">
      <Link href={`/products/${product.id}`} className="block">
        <div className="relative aspect-square overflow-hidden bg-[#f1eee5]">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={`${product.title}${product.brand ? ` by ${product.brand}` : ''} — ${product.condition.toLowerCase().replace(/_/g, ' ')} condition`}
              width={480}
              height={480}
              loading={eager ? 'eager' : 'lazy'}
              decoding="async"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-4xl font-black text-emerald-950/15" aria-hidden="true">
              GS
            </div>
          )}
          {discount > 0 && (
            <span className="absolute left-3 top-3 rounded-full bg-[#032214] px-2.5 py-1 text-xs font-bold text-[#d4af37]">
              -{discount}%
            </span>
          )}
          {!product.inStock && (
            <span className="absolute inset-x-0 bottom-0 bg-[#032214]/85 py-1.5 text-center text-xs font-semibold text-white">
              Out of stock
            </span>
          )}
        </div>
      </Link>
      <div className="space-y-1.5 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-900/45">{product.category}</p>
        <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-[#10231b]">
          <Link href={`/products/${product.id}`} className="hover:underline">
            {product.title}
          </Link>
        </h3>
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="text-base font-extrabold text-[#032214]">{naira(product.price)}</span>
          {product.compareAtPrice && product.compareAtPrice > product.price && (
            <span className="text-xs text-emerald-950/40 line-through">{naira(product.compareAtPrice)}</span>
          )}
        </p>
        <RatingStars rating={product.rating} count={product.reviewCount} />
        <p className="truncate text-xs text-emerald-950/55">
          <Link href={`/sellers/${product.sellerId}`} className="hover:text-emerald-950 hover:underline">
            {product.sellerName}
          </Link>
          {product.sellerVerified && (
            <VerifiedBadge
              sellerId={product.sellerId}
              // Visibility is decided server-side by sellerVerified above; the
              // panel re-checks the live status before showing any detail.
              status="VERIFIED"
              variant="pill"
              fallbackName={product.sellerName}
              className="ml-1 align-middle"
            />
          )}
        </p>
      </div>
    </article>
  );
}
