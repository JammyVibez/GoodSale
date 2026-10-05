// components/AnnouncementModal.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { X, Megaphone, Sparkles, RefreshCw } from 'lucide-react';
import { getDBState, UserRole, type User } from '../lib/store';
import type { Announcement } from '../lib/types';

const SEEN_KEY = 'goodsale_seen_announcements';

const KIND_META: Record<Announcement['kind'], { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  ANNOUNCEMENT: { label: 'Announcement', Icon: Megaphone },
  UPDATE: { label: "What's new", Icon: RefreshCw },
  FEATURE: { label: 'New feature', Icon: Sparkles },
};

function readSeen(): Set<number> {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(SEEN_KEY) : null;
    return raw ? new Set<number>(JSON.parse(raw)) : new Set<number>();
  } catch {
    return new Set<number>();
  }
}

function audienceMatches(audience: Announcement['audience'], user: User | null): boolean {
  if (audience === 'ALL') return true;
  if (!user) return false;
  if (audience === 'ADMIN') {
    return user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
  }
  if (audience === 'SELLER') {
    return user.role === UserRole.SELLER || user.role === UserRole.VERIFIED_SELLER;
  }
  if (audience === 'BUSINESS') {
    return user.role === UserRole.BUSINESS || user.role === UserRole.VERIFIED_BUSINESS;
  }
  if (audience === 'BUYER') return user.role === UserRole.BUYER;
  return false;
}

/**
 * Pops up whenever a visitor joins or enters the app, showing the newest
 * admin announcement they haven't dismissed yet. Dismissing is remembered per
 * device so it never nags the same person twice.
 */
export default function AnnouncementModal() {
  const [item, setItem] = useState<Announcement | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    const pick = () => {
      const state = getDBState();
      const seen = readSeen();
      const next = [...(state.announcements || [])]
        .filter((a) => a.isActive && audienceMatches(a.audience, state.currentUser))
        .filter((a) => !seen.has(a.id))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
      setItem(next || null);
      setImgFailed(false);
    };

    // Wait for the first Supabase load before deciding there's nothing to show.
    const t = window.setTimeout(pick, 900);
    pick();
    window.addEventListener('goodsale_db_state_change', pick);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('goodsale_db_state_change', pick);
    };
  }, []);

  const dismiss = () => {
    if (!item) return;
    try {
      const seen = readSeen();
      seen.add(item.id);
      window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
    } catch {
      // Storage unavailable — still closes for this session.
    }
    setItem(null);
  };

  if (!item) return null;

  const meta = KIND_META[item.kind] || KIND_META.ANNOUNCEMENT;
  const Icon = meta.Icon;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={item.title || 'Announcement'}
    >
      <div className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm" onClick={dismiss} />

      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-jade-500/25 bg-white shadow-2xl dark:bg-ink-900 animate-slide-in">
        <div className="relative bg-jade-500 px-5 py-4 text-white">
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close announcement"
            className="absolute right-3 top-3 p-1.5 rounded-full bg-black/15 transition-colors hover:bg-black/30 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest">
            <Icon className="w-3 h-3" /> {meta.label}
          </span>
          <h2 className="mt-2 pr-8 font-sans text-lg font-extrabold leading-snug">{item.title}</h2>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {item.imageUrl && !imgFailed && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt=""
              onError={() => setImgFailed(true)}
              className="mb-3 h-40 w-full rounded-xl object-cover"
            />
          )}
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink-600 dark:text-ink-300">
            {item.body}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-ink-100 px-5 py-4 dark:border-ink-800">
          <span className="text-[10px] font-mono uppercase tracking-widest text-ink-400">
            From the GoodSale team
          </span>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-xl bg-jade-500 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wide text-white transition-colors hover:bg-jade-600 cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
