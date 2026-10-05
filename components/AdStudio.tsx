// components/AdStudio.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  ImagePlus, Film, Trash2, PlayCircle, PauseCircle, Plus, Megaphone, Upload,
} from 'lucide-react';
import { getDBState, dbOperations } from '../lib/store';
import { AD_PLACEMENTS, type AdPlacement, type SponsoredAd } from '../lib/types';
import { toast } from '@/lib/feedback';

const PLACEHOLDER_LABEL: Record<AdPlacement, string> = {
  HOME: 'Home feed',
  CATEGORY: 'Category results',
  DETAIL: 'Product detail page',
  CHAT: 'Chat sidebar',
  DASHBOARD: 'Seller hub',
  SEARCH: 'Search results',
};

const VIEW_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Do nothing' },
  { value: 'marketplace', label: 'Marketplace feed' },
  { value: 'cart', label: 'Checkout / cart' },
  { value: 'revenue', label: 'Revenue hub' },
  { value: 'loyalty', label: 'GoodPoints' },
  { value: 'settings', label: 'Settings' },
];

const card = 'bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl shadow-sm';
const inp =
  'w-full bg-ink-50 dark:bg-ink-950 border border-ink-200 dark:border-ink-800 px-3 py-2 rounded-xl text-xs text-ink-800 dark:text-ink-200 focus:outline-none focus:ring-1 focus:ring-jade-500 font-mono';
const btnOk =
  'px-3 py-1.5 bg-jade-500 hover:bg-jade-600 text-white font-bold text-xs rounded-lg transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1';
const btnNo =
  'px-3 py-1.5 bg-white dark:bg-ink-900 text-ink-500 hover:bg-ink-500/10 border border-ink-200 dark:border-ink-800 font-bold text-xs rounded-lg transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1';

/**
 * Admin-only ad builder: upload an image or video from the device, pick which
 * screens the ad should appear on, and manage the ads already running.
 */
export default function AdStudio({ currentUser }: { currentUser: { id: number } }) {
  const [ads, setAds] = useState<SponsoredAd[]>([]);
  const [title, setTitle] = useState('');
  const [ctaText, setCtaText] = useState('');
  const [clickView, setClickView] = useState('');
  const [budget, setBudget] = useState('0');
  const [placements, setPlacements] = useState<AdPlacement[]>(['HOME']);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sync = () => setAds([...getDBState().sponsoredAds]);
    sync();
    window.addEventListener('goodsale_db_state_change', sync);
    return () => window.removeEventListener('goodsale_db_state_change', sync);
  }, []);

  const togglePlacement = (p: AdPlacement) => {
    setPlacements((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  const handleFile = async (file: File) => {
    const isVideo = file.type.startsWith('video/');
    if (!isVideo && !file.type.startsWith('image/')) {
      toast.error('Choose an image or a video file');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('bucket', 'ad-media');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.url) {
        throw new Error(data.error || 'Upload failed');
      }
      setMediaUrl(data.url);
      setMediaType(isVideo ? 'video' : 'image');
      toast.success(`${isVideo ? 'Video' : 'Image'} uploaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setTitle('');
    setCtaText('');
    setClickView('');
    setBudget('0');
    setPlacements(['HOME']);
    setMediaUrl('');
    setMediaType('image');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleCreate = async () => {
    if (!title.trim()) return toast.error('Give the ad a title');
    if (!mediaUrl) return toast.error('Upload an image or video first');
    if (!placements.length) return toast.error('Choose at least one placement');

    setSaving(true);
    const res = dbOperations.createAdminAd({
      title,
      mediaUrl,
      mediaType,
      ctaText,
      clickView,
      placements,
      budget: parseFloat(budget) || 0,
    });
    setSaving(false);

    if (!res.success) return toast.error(res.message || 'Could not save the ad');
    toast.success('Ad is live');
    reset();
  };

  const handleDelete = async (ad: SponsoredAd) => {
    const confirmed = await window.confirm(`Delete “${ad.title}” everywhere it shows?`);
    if (!confirmed) return;
    dbOperations.deleteAd(ad.id);
    toast.success('Ad deleted');
  };

  const handleToggle = (ad: SponsoredAd) => {
    const next = ad.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    dbOperations.setAdStatus(ad.id, next);
    toast.success(next === 'ACTIVE' ? 'Ad resumed' : 'Ad paused');
  };

  return (
    <div className="space-y-4">
      {/* Create form */}
      <div className={`${card} p-5`}>
        <div className="flex items-center gap-2 border-b border-ink-100 dark:border-ink-800 pb-3">
          <Megaphone className="w-4 h-4 text-jade-500" />
          <h4 className="font-bold text-sm text-ink-900 dark:text-white">Create an ad</h4>
          <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-ink-400">
            Image or video
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-ink-500 mb-1">Ad title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Weekend flash deals"
                className={inp}
                maxLength={80}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink-500 mb-1">Supporting line</label>
              <input
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
                placeholder="Short line shown under the title"
                className={inp}
                maxLength={140}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-ink-500 mb-1">Link to</label>
                <select value={clickView} onChange={(e) => setClickView(e.target.value)} className={inp}>
                  {VIEW_OPTIONS.map((v) => (
                    <option key={v.value} value={v.value}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-ink-500 mb-1">Budget ₦ (0 = unlimited)</label>
                <input
                  type="number"
                  min={0}
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className={inp}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink-500 mb-1">Where it shows</label>
              <div className="flex flex-wrap gap-2">
                {AD_PLACEMENTS.map((p) => {
                  const on = placements.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlacement(p)}
                      className={`rounded-xl border px-3 py-2 text-xs font-bold transition-all cursor-pointer ${
                        on
                          ? 'border-jade-500/40 bg-jade-500/[0.06] text-jade-700 dark:text-jade-400'
                          : 'border-ink-200 dark:border-ink-800 text-ink-500 hover:bg-ink-50 dark:hover:bg-ink-950'
                      }`}
                    >
                      {PLACEHOLDER_LABEL[p]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Media upload */}
          <div>
            <label className="block text-xs font-bold text-ink-500 mb-1">Media</label>
            <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-ink-200 bg-ink-50 p-4 text-center dark:border-ink-800 dark:bg-ink-950">
              {mediaUrl ? (
                <div className="w-full">
                  {mediaType === 'video' ? (
                    <video src={mediaUrl} controls playsInline className="mx-auto max-h-40 w-full rounded-lg object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl} alt="Ad preview" className="mx-auto max-h-40 w-full rounded-lg object-cover" />
                  )}
                  <button type="button" onClick={() => fileRef.current?.click()} className={`${btnOk} mt-3`}>
                    <Upload className="w-3.5 h-3.5" /> Replace media
                  </button>
                </div>
              ) : (
                <>
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-jade-500/10 text-jade-500">
                    {mediaType === 'video' ? <Film className="w-5 h-5" /> : <ImagePlus className="w-5 h-5" />}
                  </span>
                  <div className="text-xs text-ink-500">
                    Upload an image or a video straight from your device.
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-ink-400">
                      Images up to 8MB · videos up to 25MB
                    </div>
                  </div>
                  <button type="button" className={btnOk} onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? 'Uploading…' : <><Plus className="w-3.5 h-3.5" /> Choose file</>}
                  </button>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button type="button" className={btnOk} onClick={() => void handleCreate()} disabled={saving || uploading}>
            <Megaphone className="w-3.5 h-3.5" /> {saving ? 'Publishing…' : 'Publish ad'}
          </button>
        </div>
      </div>

      {/* Existing ads */}
      <div className={`${card} p-5`}>
        <div className="flex items-center gap-2 border-b border-ink-100 dark:border-ink-800 pb-3">
          <PlayCircle className="w-4 h-4 text-jade-500" />
          <h4 className="font-bold text-sm text-ink-900 dark:text-white">Running ads</h4>
          <span className="ml-auto font-mono text-xs text-ink-400">{ads.length}</span>
        </div>

        {ads.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-400">
            No ads yet — publish one above and it appears across the app instantly.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {ads.map((ad) => (
              <li
                key={ad.id}
                className="flex flex-col gap-3 rounded-xl border border-ink-100 p-3 dark:border-ink-800 sm:flex-row sm:items-center"
              >
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-ink-100 dark:bg-ink-800">
                  {(ad.mediaUrl || ad.bannerUrl) ? (
                    ad.mediaType === 'video' ? (
                      <video src={ad.mediaUrl || ad.bannerUrl} className="h-full w-full object-cover" muted />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ad.mediaUrl || ad.bannerUrl} alt={ad.title} className="h-full w-full object-cover" />
                    )
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-ink-400">
                      <Megaphone className="w-4 h-4" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-bold text-ink-800 dark:text-ink-200">{ad.title}</span>
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${
                        ad.status === 'ACTIVE'
                          ? 'bg-jade-500/10 text-jade-600 dark:text-jade-400'
                          : 'bg-ink-100 text-ink-400 dark:bg-ink-800'
                      }`}
                    >
                      {ad.status}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-ink-400">
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 dark:bg-ink-800">
                      {ad.mediaType === 'video' ? 'Video' : 'Image'}
                    </span>
                    {(ad.placements?.length ? ad.placements : ['HOME']).map((p) => (
                      <span key={p} className="rounded bg-ink-100 px-1.5 py-0.5 dark:bg-ink-800">
                        {PLACEHOLDER_LABEL[p as AdPlacement] || p}
                      </span>
                    ))}
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 dark:bg-ink-800">
                      {ad.impressions} views · {ad.clicks} clicks
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 gap-2">
                  <button type="button" className={btnNo} onClick={() => handleToggle(ad)}>
                    {ad.status === 'ACTIVE' ? (
                      <><PauseCircle className="w-3.5 h-3.5" /> Pause</>
                    ) : (
                      <><PlayCircle className="w-3.5 h-3.5" /> Resume</>
                    )}
                  </button>
                  <button
                    type="button"
                    className={`${btnNo} hover:text-red-500`}
                    onClick={() => void handleDelete(ad)}
                    aria-label={`Delete ${ad.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
