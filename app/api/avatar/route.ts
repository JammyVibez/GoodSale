import { NextRequest, NextResponse } from 'next/server';
import { initialsFor, renderAvatarSvg } from '@/lib/avatar';

/**
 * Deterministic SVG avatar endpoint.
 *
 *   /api/avatar?name=Chinedu%20Okafor  → initials monogram
 *   /api/avatar?seed=12                → neutral person glyph
 *
 * The launch catalog used to point at i.pravatar.cc, which served mostly
 * Western stock faces — a poor fit for a Nigerian marketplace, and a random
 * gender/age photo for every name. This endpoint renders a stable, culturally
 * neutral monogram (or a plain silhouette) on a brand-coloured gradient
 * instead, so a seller's avatar never contradicts their name and no third
 * party is involved.
 */
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const name = params.get('name')?.trim() || '';
  const seed = params.get('seed')?.trim() || '';
  const initials = name ? initialsFor(name) : '';
  const key = name || seed || 'goodsale';

  return new NextResponse(renderAvatarSvg(key, initials), {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
