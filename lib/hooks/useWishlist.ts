'use client';

/**
 * Shared wishlist state.
 *
 * The marketplace header and the marketplace home both need the saved items,
 * so the list lives in localStorage and every mounted consumer subscribes to a
 * single custom event. Toggling in one place updates the other immediately
 * (and across tabs via the native `storage` event).
 */
import { useCallback, useEffect, useState } from 'react';

const KEY = 'goodsale_wishlist';
const EVENT = 'goodsale:wishlist';

function readWishlist(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'number') : [];
  } catch {
    return [];
  }
}

export function useWishlist() {
  const [favorites, setFavorites] = useState<number[]>([]);

  useEffect(() => {
    const sync = () => setFavorites(readWishlist());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const toggle = useCallback((productId: number) => {
    const current = readWishlist();
    const next = current.includes(productId)
      ? current.filter((id) => id !== productId)
      : [...current, productId];
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage blocked — keep the in-memory copy */
    }
    window.dispatchEvent(new Event(EVENT));
    setFavorites(next);
  }, []);

  return { favorites, toggle, count: favorites.length };
}
