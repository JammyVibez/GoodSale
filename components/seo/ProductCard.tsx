import Link from 'next/link';
import { BadgeCheck, Star, Truck } from 'lucide-react';
import { naira } from '@/lib/seo/site';
import type { SeoProduct } from '@/lib/seo/data';

export function RatingStars({ rating, count }: { rating: number | null; count: number }) {
  if (rating === null || count === 0) return null;
  const rounded = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-950/65" aria-label={`Rated ${rating} out of 5 from ${count} reviews`}>
      <span aria-hidden="true" className="text-[#b8912c]">
        {'★'.repeat(rounded)}
        <span className="text-emerald-950/20">{'★'.repeat(5 - rounded)}</span>
      </span>
      <span>{rating.toFixed(1)}</span>
      <span>({count})</span>
    </span>
  );
}

/** Effective price: an in-window flash sale beats the listed price. */
function priceFor(product: SeoProduct) {
  const flashPrice = Number(product.flashSalePrice) || 0;
  const now = Date.now();
  const start = product.flashSaleStartsAt ? new Date(product.flashSaleStartsAt).getTime() : 0;
  const end = product.flashSaleEndsAt ? new Date(product.flashSaleEndsAt).getTime() : NaN;
  const flashLive = flashPrice > 0 && flashPrice < product.price && Number.isFinite(end) && now >= start && now < end;
  const compareAt = flashLive
    ? product.price
    : product.compareAtPrice && product.compareAtPrice > product.price
      ? product.compareAtPrice
      : 0;
  const price = flashLive ? flashPrice : product.price;
  return {
    price,
    compareAt,
    discount: compareAt > price ? Math.round(((compareAt - price) / compareAt) * 100) : 0,
    flashSale: flashLive,
  };
}

/**
 * Compact public product card — the same density as the in-app card so a shopper
 * moving between the marketplace and a listing page sees one product language.
 */
export function ProductCard({ product, eager = false }: { product: SeoProduct; eager?: boolean }) {
  const image = product.images[0];
  const { price, compareAt, discount, flashSale } = priceFor(product);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-emerald-950/10 bg-white transition-[border-color,box-shadow] hover:border-emerald-800/30 hover:shadow-[0_12px_28px_-16px_rgba(3,34,20,0.35)]">
      <div className="relative aspect-square w-full overflow-hidden bg-[#f1eee5]">
        <Link href={`/products/${product.id}`} className="block h-full w-full">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={`${product.title}${product.brand ? ` by ${product.brand}` : ''} — ${product.condition.toLowerCase().replace(/_/g, ' ')} condition`}
              width={480}
              height={480}
              loading={eager ? 'eager' : 'lazy'}
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            />
          ) : (
            <span className="flex h-full items-center justify-center text-3xl font-black text-emerald-950/15" aria-hidden="true">
              GS
            </span>
          )}
        </Link>

        <span className="pointer-events-none absolute left-1.5 top-1.5 flex flex-col items-start gap-1">
          {discount > 0 && (
            <span className="rounded bg-[#032214] px-1.5 py-0.5 text-[10px] font-black leading-4 text-[#f7d34d]">
              -{discount}%
            </span>
          )}
          {flashSale && (
            <span className="rounded bg-[#0a7441] px-1.5 py-0.5 text-[9px] font-black uppercase leading-4 tracking-wide text-white">
              Flash
            </span>
          )}
        </span>

        {!product.inStock && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-[#032214]/80 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-white">
            Out of stock
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-2">
        <h3 className="line-clamp-2 min-h-[2rem] text-[12px] font-semibold leading-4 text-[#10231b]">
          <Link href={`/products/${product.id}`} className="hover:text-emerald-800">
            {product.title}
          </Link>
        </h3>

        <span className="flex min-h-[14px] items-center gap-1 text-[10px] leading-none text-emerald-950/60">
          {product.rating && product.reviewCount > 0 ? (
            <>
              <Star className="h-3 w-3 fill-[#eab308] text-[#eab308]" aria-hidden="true" />
              <span className="font-bold text-[#10231b]">{product.rating.toFixed(1)}</span>
              <span>({product.reviewCount})</span>
            </>
          ) : (
            <span className="text-emerald-950/40">No reviews yet</span>
          )}
        </span>

        <p className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-[15px] font-extrabold leading-5 tracking-tight text-[#032214]">{naira(price)}</span>
          {compareAt > price && (
            <span className="text-[10px] font-medium text-emerald-950/40 line-through">{naira(compareAt)}</span>
          )}
        </p>

        <p className="flex items-center gap-1 text-[10px] leading-3 text-emerald-950/55">
          <Truck className="h-3 w-3 shrink-0 text-emerald-950/35" aria-hidden="true" />
          <span className="truncate">{product.sellerState ? `Ships from ${product.sellerState}` : 'Escrow protected'}</span>
        </p>

        <p className="flex min-w-0 items-center gap-1 text-[10px] text-emerald-950/55">
          <Link href={`/sellers/${product.sellerId}`} className="truncate hover:text-emerald-900 hover:underline">
            {product.sellerName}
          </Link>
          {product.sellerVerified && (
            <span
              className="inline-grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full bg-[#0a8541]/12 text-[#0a7441]"
              aria-label="Verified seller"
              title="Verified seller"
            >
              <BadgeCheck className="h-3 w-3" aria-hidden="true" />
            </span>
          )}
        </p>
      </div>
    </article>
  );
}
