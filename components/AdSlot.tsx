// components/AdSlot.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Play, Sparkles } from 'lucide-react';
import { getDBState, dbOperations } from '../lib/store';
import type { AdPlacement } from '../lib/types';

export interface AdSlotProps {
  /** Where this slot lives in the app; matches the admin-chosen placements. */
  placement: AdPlacement;
  /** Optional navigation callback so the ad can deep-link into a view. */
  onNavigate?: (view: string, payload?: Record<string, unknown>) => void;
  /** Override the card shape (e.g. compact rail vs full-width banner). */
  variant?: 'banner' | 'rail';
  className?: string;
}

const DISMISS_KEY = 'goodsale_dismissed_ads';

function readDismissed(): Set<number> {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(DISMISS_KEY) : null;
    return raw ? new Set<number>(JSON.parse(raw)) : new Set<number>();
  } catch {
    return new Set<number>();
  }
}

/**
 * Renders the highest-engagement active sponsored ad configured to show in this
 * placement. Returns nothing when no ad targets the slot or the visitor closed
 * it, so the surrounding layout never jumps.
 */
export default function AdSlot({ placement, onNavigate, variant = 'banner', className = '' }: AdSlotProps) {
  const [db, setDb] = useState(getDBState());
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(() => readDismissed());
  const [videoError, setVideoError] = useState(false);
  const impressionsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const handleStateChange = () => setDb(getDBState());
    window.addEventListener('goodsale_db_state_change', handleStateChange);
    return () => window.removeEventListener('goodsale_db_state_change', handleStateChange);
  }, []);

  const ad = useMemo(() => {
    const active = (db.sponsoredAds || []).filter((a) => {
      if (a.status !== 'ACTIVE') return false;
      const placements = (a.placements && a.placements.length ? a.placements : ['HOME']) as string[];
      return placements.includes(placement);
    });
    if (!active.length) return null;
    // Prefer the ad that still has budget left, then the most recently created.
    const spendable = active.filter((a) => a.spent < a.budget);
    const pool = spendable.length ? spendable : active;
    return [...pool].sort((a, b) => b.id - a.id)[0];
  }, [db.sponsoredAds, placement]);

  const closed = ad ? dismissedIds.has(ad.id) : false;

  useEffect(() => {
    setVideoError(false);
  }, [ad?.id]);

  // One impression per ad per session per slot.
  useEffect(() => {
    if (!ad || dismissedIds.has(ad.id)) return;
    if (impressionsRef.current.has(ad.id)) return;
    impressionsRef.current.add(ad.id);
    dbOperations.interactSponsoredAd(ad.id, 'IMPRESSION');
  }, [ad, dismissedIds]);

  if (!ad || closed) return null;

  const mediaUrl = ad.mediaUrl || ad.bannerUrl || '';
  const isVideo = ad.mediaType === 'video' && Boolean(mediaUrl);
  const showMedia = Boolean(mediaUrl);

  const handleDismiss = () => {
    const next = new Set(dismissedIds);
    next.add(ad.id);
    setDismissedIds(next);
    try {
      window.localStorage.setItem(DISMISS_KEY, JSON.stringify([...next]));
    } catch {
      // Storage unavailable — dismissing still works for this session.
    }
  };

  const handleClick = () => {
    dbOperations.interactSponsoredAd(ad.id, 'CLICK');
    if (ad.clickView && onNavigate) {
      onNavigate(ad.clickView);
    }
  };

  return (
    <aside
      className={`relative overflow-hidden rounded-2xl border border-jade-500/25 bg-white shadow-sm transition-all hover:shadow-md dark:border-jade-500/20 dark:bg-ink-900 ${className}`}
      aria-label="Sponsored advertisement"
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Close ad"
        className="absolute right-2 top-2 z-10 p-1.5 rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/70 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="flex flex-col sm:flex-row">
        {showMedia && (
          <div
            className={`relative shrink-0 overflow-hidden bg-ink-100 dark:bg-ink-800 ${
              variant === 'rail' ? 'w-full h-40 sm:h-full sm:w-48' : 'w-full h-44 sm:h-auto sm:w-56'
            }`}
          >
            {isVideo && !videoError ? (
              <video
                src={mediaUrl}
                className="h-full w-full object-cover"
                muted
                loop
                playsInline
                autoPlay
                preload="metadata"
                onError={() => setVideoError(true)}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl} alt={ad.title} className="h-full w-full object-cover" loading="lazy" />
            )}
            {isVideo && !videoError && (
              <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
                <Play className="w-3 h-3 fill-white" /> Video
              </span>
            )}
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 p-4">
          <span className="flex w-fit items-center gap-1 rounded-full bg-jade-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-jade-600 dark:text-jade-400">
            <Sparkles className="w-3 h-3" /> Sponsored
          </span>
          <div className="min-w-0">
            <h4 className="truncate font-sans font-bold text-sm text-ink-900 dark:text-white">{ad.title}</h4>
            {ad.ctaText && (
              <p className="mt-0.5 line-clamp-2 text-xs text-ink-500 dark:text-ink-400">{ad.ctaText}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClick}
              className="inline-flex items-center gap-1.5 rounded-xl bg-jade-500 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-jade-600 cursor-pointer"
            >
              Learn more
            </button>
            <span className="text-[10px] font-mono uppercase tracking-widest text-ink-400">Ad</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
