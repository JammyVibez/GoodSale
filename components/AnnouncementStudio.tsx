// components/AnnouncementStudio.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { Megaphone, Trash2, Eye, EyeOff, Send } from 'lucide-react';
import { getDBState, dbOperations } from '../lib/store';
import type { Announcement } from '../lib/types';
import { toast } from '@/lib/feedback';

const card = 'bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl shadow-sm';
const inp =
  'w-full bg-ink-50 dark:bg-ink-950 border border-ink-200 dark:border-ink-800 px-3 py-2 rounded-xl text-xs text-ink-800 dark:text-ink-200 focus:outline-none focus:ring-1 focus:ring-jade-500 font-mono';
const btnOk =
  'px-3 py-1.5 bg-jade-500 hover:bg-jade-600 text-white font-bold text-xs rounded-lg transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1';
const btnNo =
  'px-3 py-1.5 bg-white dark:bg-ink-900 text-ink-500 hover:bg-ink-500/10 border border-ink-200 dark:border-ink-800 font-bold text-xs rounded-lg transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1';

const KINDS: Announcement['kind'][] = ['ANNOUNCEMENT', 'UPDATE', 'FEATURE'];
const AUDIENCES: { value: Announcement['audience']; label: string }[] = [
  { value: 'ALL', label: 'Everyone' },
  { value: 'BUYER', label: 'Buyers' },
  { value: 'SELLER', label: 'Sellers' },
  { value: 'BUSINESS', label: 'Businesses' },
  { value: 'ADMIN', label: 'Admins only' },
];

/** Admin composer + manager for the popup shown to users on app entry. */
export default function AnnouncementStudio() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<Announcement['kind']>('ANNOUNCEMENT');
  const [audience, setAudience] = useState<Announcement['audience']>('ALL');

  useEffect(() => {
    const sync = () => setItems([...getDBState().announcements]);
    sync();
    window.addEventListener('goodsale_db_state_change', sync);
    return () => window.removeEventListener('goodsale_db_state_change', sync);
  }, []);

  const publish = () => {
    const res = dbOperations.createAnnouncement({ title, body, kind, audience });
    if (!res.success) return toast.error(res.message || 'Could not publish');
    toast.success('Published — it pops up on the next visit');
    setTitle('');
    setBody('');
    setKind('ANNOUNCEMENT');
    setAudience('ALL');
  };

  const toggle = (a: Announcement) => {
    dbOperations.setAnnouncementActive(a.id, !a.isActive);
    toast.success(a.isActive ? 'Announcement hidden' : 'Announcement live');
  };

  const remove = async (a: Announcement) => {
    if (!(await window.confirm(`Delete “${a.title}” permanently?`))) return;
    dbOperations.deleteAnnouncement(a.id);
    toast.success('Deleted');
  };

  return (
    <div className={card}>
      <div className="flex items-center gap-2 border-b border-ink-100 px-5 py-4 dark:border-ink-800">
        <Megaphone className="w-4 h-4 text-jade-500" />
        <h4 className="font-bold text-sm text-ink-900 dark:text-white">Announcements</h4>
        <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-ink-400">
          Pops up on app entry
        </span>
      </div>

      <div className="space-y-3 p-5">
        <div>
          <label className="mb-1 block text-xs font-bold text-ink-500">Headline</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Escrow fees are now 0% at launch"
            className={inp}
            maxLength={90}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-ink-500">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Updates, new features, tips — whatever users should know when they enter the app."
            rows={3}
            className={`${inp} resize-y font-sans`}
            maxLength={600}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-ink-500">Type</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as Announcement['kind'])} className={inp}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k === 'UPDATE' ? "What's new" : k === 'FEATURE' ? 'New feature' : 'Announcement'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-ink-500">Show to</label>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as Announcement['audience'])}
              className={inp}
            >
              {AUDIENCES.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="button" className={btnOk} onClick={publish}>
            <Send className="w-3.5 h-3.5" /> Publish announcement
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <ul className="space-y-2 border-t border-ink-100 px-5 py-4 dark:border-ink-800">
          {items.map((a) => (
            <li key={a.id} className="flex items-start gap-3 rounded-xl border border-ink-100 p-3 dark:border-ink-800">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-bold text-ink-800 dark:text-ink-200">{a.title}</span>
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${
                      a.isActive
                        ? 'bg-jade-500/10 text-jade-600 dark:text-jade-400'
                        : 'bg-ink-100 text-ink-400 dark:bg-ink-800'
                    }`}
                  >
                    {a.isActive ? 'Live' : 'Hidden'}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-ink-400">{a.body}</p>
                <span className="mt-1 inline-block rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-400 dark:bg-ink-800">
                  {AUDIENCES.find((x) => x.value === a.audience)?.label || a.audience}
                </span>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" className={btnNo} onClick={() => toggle(a)} aria-label="Toggle announcement">
                  {a.isActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  className={`${btnNo} hover:text-red-500`}
                  onClick={() => void remove(a)}
                  aria-label="Delete announcement"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
