// components/SeedManager.tsx
'use client';

/**
 * Admin → Launch catalog.
 *
 * Creates and manages the seeded Nigerian marketplace (20 sellers, 100 listings,
 * buyers and reviews). Every seeded row is flagged `is_seeded` and the API behind
 * this screen refuses to write to anything else, so an admin can freely rename,
 * re-price, re-photograph or delete the launch catalog without any risk to a real
 * seller's account or listing.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Loader2, RefreshCw, Sparkles, Trash2, Upload, Save, KeyRound,
  CheckCircle2, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast, confirmDialog } from '@/lib/feedback';
import { uploadMedia } from '@/lib/upload';
import { SmartAvatar, SmartImage } from './ui/SmartImage';
import type { SeededCatalogSnapshot, SeededProductRecord, SeededSellerRecord } from '@/lib/seed/db';

const SELLER_ROLES = ['SELLER', 'VERIFIED_SELLER', 'BUSINESS', 'VERIFIED_BUSINESS'] as const;
const LEVELS = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'] as const;

const inp =
  'w-full bg-ink-50 dark:bg-ink-950 border border-ink-200 dark:border-ink-800 px-3 py-2 rounded-xl text-xs text-ink-800 dark:text-ink-200 focus:outline-none focus:ring-1 focus:ring-jade-500';
const btnOk =
  'px-3 py-1.5 bg-jade-500 hover:bg-jade-600 text-white font-bold text-xs rounded-lg transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5';
const btnNo =
  'px-3 py-1.5 bg-white dark:bg-ink-900 text-ink-600 dark:text-ink-300 hover:bg-ink-500/10 border border-ink-200 dark:border-ink-800 font-bold text-xs rounded-lg transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5';
const card = 'bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl shadow-sm';

type SellerDraft = Record<string, unknown>;
type ProductDraft = Record<string, unknown>;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold text-ink-500">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-ink-50 dark:bg-ink-950 px-3 py-2">
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{label}</div>
      <div className="font-mono text-lg font-black text-ink-900 dark:text-white">{value}</div>
      {hint && <div className="text-[10px] text-ink-400">{hint}</div>}
    </div>
  );
}

export default function SeedManager() {
  const [data, setData] = useState<SeededCatalogSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [openSeller, setOpenSeller] = useState<number | null>(null);
  const [sellerDrafts, setSellerDrafts] = useState<Record<number, SellerDraft>>({});
  const [productDrafts, setProductDrafts] = useState<Record<number, ProductDraft>>({});
  const [password, setPassword] = useState('');

  const applySnapshot = useCallback((snapshot: Partial<SeededCatalogSnapshot>) => {
    if (!Array.isArray(snapshot.sellers) || !snapshot.totals) return;
    setData(snapshot as SeededCatalogSnapshot);
    setSellerDrafts({});
    setProductDrafts({});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/seed', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not load the launch catalog');
      applySnapshot(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the launch catalog');
    } finally {
      setLoading(false);
    }
  }, [applySnapshot]);

  useEffect(() => { void load(); }, [load]);

  const run = async (action: string, payload: Record<string, unknown> = {}, okMsg?: string) => {
    setBusy(action + String(payload.id ?? ''));
    setError('');
    try {
      const res = await fetch('/api/admin/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Action failed');
      applySnapshot(json);
      if (okMsg) toast.success(okMsg);
      return json;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action failed';
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setBusy('');
    }
  };

  const setSellerField = (id: number, key: string, value: unknown) =>
    setSellerDrafts((d) => ({ ...d, [id]: { ...(d[id] || {}), [key]: value } }));

  const setBusinessField = (id: number, key: string, value: unknown) =>
    setSellerDrafts((d) => ({
      ...d,
      [id]: { ...(d[id] || {}), business: { ...((d[id]?.business as SellerDraft) || {}), [key]: value } },
    }));

  const setProductField = (id: number, key: string, value: unknown) =>
    setProductDrafts((d) => ({ ...d, [id]: { ...(d[id] || {}), [key]: value } }));

  const uploadImage = async (
    file: File | undefined,
    onDone: (url: string) => void,
    bucket: 'product-images' | 'avatars' = 'product-images'
  ) => {
    if (!file) return;
    setBusy('upload');
    try {
      const url = await uploadMedia(file, bucket);
      onDone(url);
      toast.success('Image uploaded — remember to save');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return (
      <div className={`${card} flex items-center gap-2 p-6 text-xs text-ink-500`}>
        <Loader2 className="h-4 w-4 animate-spin" /> Loading the launch catalog…
      </div>
    );
  }

  const totals = data?.totals;
  const seeded = Boolean(totals?.sellers);
  const reviewTarget = totals?.seedReviews ?? 0;

  return (
    <div className="space-y-5">
      {/* ---------------------------------------------------------------- */}
      <div className={`${card} p-5`}>
        <h3 className="flex items-center gap-2 font-sans font-bold text-lg text-ink-900 dark:text-white">
          <Sparkles className="w-5 h-5 text-jade-500" /> Launch catalog (seeded marketplace)
        </h3>
        <p className="mt-1 text-xs text-ink-500 dark:text-ink-400 leading-relaxed">
          Creates the Nigerian launch market — 20 seller accounts (market stores, registered businesses and
          individual traders), {totals?.seedProducts ?? 100} listings across{' '}
          {new Set((data?.sellers || []).flatMap((s) => s.products.map((p) => p.category))).size || 'several'}{' '}
          categories, buyer accounts and reviews. Seeded rows are tagged so you can edit or delete them here
          without ever touching real sellers.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Sellers" value={String(totals?.sellers ?? 0)} hint={`target ${totals?.seedSellers ?? 20}`} />
          <Stat label="Stores" value={String(totals?.businesses ?? 0)} hint="with storefronts" />
          <Stat label="Buyers" value={String(totals?.buyers ?? 0)} hint="review authors" />
          <Stat label="Listings" value={String(totals?.products ?? 0)} hint={`target ${totals?.seedProducts ?? 100}`} />
          <Stat label="Reviews" value={String(totals?.reviews ?? 0)} hint={`seed set ${reviewTarget}`} />
          <Stat label="State" value={seeded ? 'Live' : 'Empty'} hint={seeded ? 'in the marketplace' : 'nothing seeded yet'} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            className={btnOk}
            disabled={Boolean(busy)}
            onClick={() => run('seed', {}, 'Launch catalog created')}
          >
            {busy === 'seed' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {seeded ? 'Top up missing accounts & listings' : 'Seed the marketplace'}
          </button>

          <button
            className={btnNo}
            disabled={Boolean(busy)}
            onClick={async () => {
              const ok = await confirmDialog({
                title: 'Rebuild the launch catalog',
                message:
                  'This deletes every seeded listing, store, review and buyer, then recreates the original 100 listings. Real seller accounts are untouched. Continue?',
                confirmText: 'Rebuild',
                danger: true,
              });
              if (ok) await run('seed', { force: true }, 'Launch catalog rebuilt');
            }}
          >
            {busy === 'seed' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Rebuild from source
          </button>

          <button className={btnNo} disabled={Boolean(busy)} onClick={() => void load()}>
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> Refresh
          </button>

        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}
        {busy === 'seed' && (
          <p className="mt-3 text-[11px] text-ink-400">
            Creating accounts, storefronts, listings and reviews — this can take up to a minute on a fresh project.
          </p>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Danger zone — wipe every seeded row in one action                 */}
      <div className="rounded-2xl border border-red-200 bg-red-50/70 p-5 dark:border-red-900/40 dark:bg-red-950/20">
        <h3 className="flex items-center gap-2 font-sans font-bold text-sm text-red-700 dark:text-red-300">
          <Trash2 className="h-4 w-4" /> Delete all seeded data
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-red-700/85 dark:text-red-300/85">
          Removes every seeded account (including their sign-in accounts), storefront, listing, review and reply
          in one go. Real sellers, buyers, orders and wallets are never touched. <strong>This cannot be undone.</strong>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={Boolean(busy) || !seeded}
            onClick={async () => {
              const ok = await confirmDialog({
                title: 'Delete ALL seeded data',
                message:
                  'This permanently deletes every seeded seller and buyer account (their logins too), every seed storefront, all 100 listings and all their reviews and replies. Real users and orders are not affected. Continue?',
                confirmText: 'Delete everything',
                danger: true,
              });
              if (ok) await run('remove', {}, 'All seeded data deleted');
            }}
          >
            {busy === 'remove' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete all seeded data
          </button>
          <span className="text-[11px] font-semibold text-red-600/80 dark:text-red-300/80">
            {seeded
              ? `${totals?.sellers ?? 0} sellers · ${totals?.businesses ?? 0} stores · ${totals?.products ?? 0} listings · ${totals?.reviews ?? 0} reviews`
              : 'Nothing is seeded right now.'}
          </span>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {data?.sellers.length ? (
        <div className="space-y-3">
          {data.sellers.map((seller) => (
            <SellerCard
              key={seller.id}
              seller={seller}
              open={openSeller === seller.id}
              busy={busy}
              draft={sellerDrafts[seller.id] || {}}
              productDrafts={productDrafts}
              options={data.options}
              password={password}
              setPassword={setPassword}
              onToggle={() => setOpenSeller(openSeller === seller.id ? null : seller.id)}
              onSellerField={setSellerField}
              onBusinessField={setBusinessField}
              onProductField={setProductField}
              onUpload={uploadImage}
              onSaveSeller={(id, patch) => run('update-seller', { id, patch }, 'Account saved')}
              onSaveProduct={(id, patch) => run('update-product', { id, patch }, 'Listing saved')}
              onDeleteProduct={(id) => run('delete-product', { id }, 'Listing deleted')}
              onSetPassword={(username, value) => run('set-password', { username, password: value }, 'Password set')}
            />
          ))}
        </div>
      ) : (
        <div className={`${card} p-8 text-center text-xs text-ink-400`}>
          Nothing seeded yet. Press <strong>Seed the marketplace</strong> to create the launch catalog.
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

interface SellerCardProps {
  seller: SeededSellerRecord;
  open: boolean;
  busy: string;
  draft: SellerDraft;
  productDrafts: Record<number, ProductDraft>;
  options: SeededCatalogSnapshot['options'];
  password: string;
  setPassword: (v: string) => void;
  onToggle: () => void;
  onSellerField: (id: number, key: string, value: unknown) => void;
  onBusinessField: (id: number, key: string, value: unknown) => void;
  onProductField: (id: number, key: string, value: unknown) => void;
  onUpload: (file: File | undefined, onDone: (url: string) => void, bucket?: 'product-images' | 'avatars') => void;
  onSaveSeller: (id: number, patch: SellerDraft) => void;
  onSaveProduct: (id: number, patch: ProductDraft) => void;
  onDeleteProduct: (id: number) => void;
  onSetPassword: (username: string, password: string) => void;
}

function SellerCard({
  seller, open, busy, draft, productDrafts, options, password, setPassword,
  onToggle, onSellerField, onBusinessField, onProductField, onUpload,
  onSaveSeller, onSaveProduct, onDeleteProduct, onSetPassword,
}: SellerCardProps) {
  const value = (key: keyof SeededSellerRecord | string) =>
    (draft[key] as string | number | undefined) ?? (seller as unknown as Record<string, unknown>)[key] ?? '';
  const business = seller.business;
  const businessValue = (key: string) =>
    ((draft.business as SellerDraft | undefined)?.[key] as string | undefined) ??
    ((business as unknown as Record<string, unknown>)?.[key] as string | undefined) ?? '';

  return (
    <div className={card}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left cursor-pointer"
      >
        <SmartAvatar src={seller.photoUrl} name={seller.fullName} seed={seller.username} className="h-11 w-11 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-sm text-ink-900 dark:text-white truncate">{seller.fullName}</span>
            <span className="rounded-md bg-jade-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-jade-600 dark:text-jade-400">
              {seller.role}
            </span>
            {business && (
              <span className="rounded-md bg-ink-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink-500">
                STORE
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-ink-400">
            @{seller.username} · {seller.city}, {seller.state} · {seller.products.length} listings
            {business ? ` · ${business.name}` : ''}
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-ink-400" /> : <ChevronDown className="w-4 h-4 text-ink-400" />}
      </button>

      {open && (
        <div className="space-y-5 border-t border-ink-100 p-4 dark:border-ink-800">
          {/* Seller account fields */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="font-bold text-xs uppercase tracking-wide text-ink-500">Seller account</h4>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id={`seller-photo-${seller.id}`}
                  onChange={(e) => onUpload(e.target.files?.[0], (url) => onSellerField(seller.id, 'photoUrl', url), 'avatars')}
                />
                <label htmlFor={`seller-photo-${seller.id}`} className={`${btnNo} cursor-pointer`}>
                  <Upload className="w-3.5 h-3.5" /> Photo
                </label>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Full name">
                <input className={inp} value={String(value('fullName'))} onChange={(e) => onSellerField(seller.id, 'fullName', e.target.value)} />
              </Field>
              <Field label="Username">
                <input className={inp} value={String(value('username'))} onChange={(e) => onSellerField(seller.id, 'username', e.target.value)} />
              </Field>
              <Field label="Email (login)">
                <input className={inp} value={String(value('email'))} onChange={(e) => onSellerField(seller.id, 'email', e.target.value)} />
              </Field>
              <Field label="Phone">
                <input className={inp} value={String(value('phone'))} onChange={(e) => onSellerField(seller.id, 'phone', e.target.value)} />
              </Field>
              <Field label="Role / badge">
                <select
                  className={inp}
                  value={String(value('role'))}
                  onChange={(e) => onSellerField(seller.id, 'role', e.target.value)}
                >
                  {SELLER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Seller level">
                <select
                  className={inp}
                  value={String(value('sellerLevel'))}
                  onChange={(e) => onSellerField(seller.id, 'sellerLevel', e.target.value)}
                >
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
              <Field label="City">
                <input className={inp} value={String(value('city'))} onChange={(e) => onSellerField(seller.id, 'city', e.target.value)} />
              </Field>
              <Field label="State">
                <input className={inp} value={String(value('state'))} onChange={(e) => onSellerField(seller.id, 'state', e.target.value)} />
              </Field>
              <Field label="Trust score">
                <input
                  type="number"
                  className={inp}
                  value={String(value('trustScore'))}
                  onChange={(e) => onSellerField(seller.id, 'trustScore', Number(e.target.value))}
                />
              </Field>
              <div className="sm:col-span-2 lg:col-span-3">
                <Field label="Shop address">
                  <input className={inp} value={String(value('address'))} onChange={(e) => onSellerField(seller.id, 'address', e.target.value)} />
                </Field>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <Field label="About the seller (shown on the storefront)">
                  <textarea
                    rows={2}
                    className={inp}
                    value={String(value('bio'))}
                    onChange={(e) => onSellerField(seller.id, 'bio', e.target.value)}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <Field label="Profile photo URL (or upload above)">
                  <input className={inp} value={String(value('photoUrl'))} onChange={(e) => onSellerField(seller.id, 'photoUrl', e.target.value)} />
                </Field>
              </div>
            </div>

            {business && (
              <div className="mt-4 rounded-xl border border-ink-200 p-3 dark:border-ink-800">
                <h5 className="mb-2 flex items-center gap-2 font-bold text-xs uppercase tracking-wide text-ink-500">
                  Storefront
                  <label className="flex items-center gap-1 text-[10px] font-normal normal-case text-ink-400">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-jade-500"
                      checked={Boolean(draft.business && (draft.business as SellerDraft).isVerified !== undefined ? (draft.business as SellerDraft).isVerified : business.isVerified)}
                      onChange={(e) => onBusinessField(seller.id, 'isVerified', e.target.checked)}
                    />
                    verified badge
                  </label>
                </h5>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Store name">
                    <input className={inp} value={String(businessValue('name'))} onChange={(e) => onBusinessField(seller.id, 'name', e.target.value)} />
                  </Field>
                  <Field label="Opening hours">
                    <input className={inp} value={String(businessValue('openingHours'))} onChange={(e) => onBusinessField(seller.id, 'openingHours', e.target.value)} />
                  </Field>
                  <Field label="Followers">
                    <input
                      type="number"
                      className={inp}
                      value={String(businessValue('followers'))}
                      onChange={(e) => onBusinessField(seller.id, 'followers', Number(e.target.value))}
                    />
                  </Field>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Field label="Store description">
                      <textarea
                        rows={2}
                        className={inp}
                        value={String(businessValue('description'))}
                        onChange={(e) => onBusinessField(seller.id, 'description', e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Field label="Store address">
                      <input className={inp} value={String(businessValue('address'))} onChange={(e) => onBusinessField(seller.id, 'address', e.target.value)} />
                    </Field>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3 flex items-end gap-2">
                    <div className="flex-1">
                      <Field label="Store logo URL">
                        <input className={inp} value={String(businessValue('logoUrl'))} onChange={(e) => onBusinessField(seller.id, 'logoUrl', e.target.value)} />
                      </Field>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id={`store-logo-${seller.id}`}
                      onChange={(e) => onUpload(e.target.files?.[0], (url) => onBusinessField(seller.id, 'logoUrl', url), 'avatars')}
                    />
                    <label htmlFor={`store-logo-${seller.id}`} className={`${btnNo} cursor-pointer`}>
                      <Upload className="w-3.5 h-3.5" /> Logo
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                className={btnOk}
                disabled={Boolean(busy)}
                onClick={() => onSaveSeller(seller.id, draft)}
              >
                <Save className="w-3.5 h-3.5" /> Save account
              </button>
              <div className="ml-auto flex items-center gap-2">
                <input
                  className={`${inp} w-44`}
                  placeholder="New password (8+)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  className={btnNo}
                  disabled={Boolean(busy) || password.length < 8}
                  onClick={() => {
                    onSetPassword(seller.username, password);
                    setPassword('');
                  }}
                >
                  <KeyRound className="w-3.5 h-3.5" /> Set login password
                </button>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-ink-400">
              Seeded accounts are created with a random password. Set one here if you want to log in as this seller to
              demo the storefront.
            </p>
          </div>

          {/* Products */}
          <div>
            <h4 className="mb-2 font-bold text-xs uppercase tracking-wide text-ink-500">
              Listings ({seller.products.length})
            </h4>
            <div className="space-y-3">
              {seller.products.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  options={options}
                  busy={busy}
                  draft={productDrafts[product.id] || {}}
                  onField={onProductField}
                  onUpload={onUpload}
                  onSave={onSaveProduct}
                  onDelete={onDeleteProduct}
                />
              ))}
              {!seller.products.length && (
                <p className="text-[11px] text-ink-400">
                  No seeded listings for this account yet — run “Top up missing accounts &amp; listings”.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ProductRow({
  product, options, busy, draft, onField, onUpload, onSave, onDelete,
}: {
  product: SeededProductRecord;
  options: SeededCatalogSnapshot['options'];
  busy: string;
  draft: ProductDraft;
  onField: (id: number, key: string, value: unknown) => void;
  onUpload: (file: File | undefined, onDone: (url: string) => void, bucket?: 'product-images' | 'avatars') => void;
  onSave: (id: number, patch: ProductDraft) => void;
  onDelete: (id: number) => void;
}) {
  const [images, setImages] = useState<string[] | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const value = (key: keyof SeededProductRecord | string) =>
    (draft[key] as string | number | boolean | undefined) ??
    (product as unknown as Record<string, unknown>)[key] ?? '';
  const currentImages = images ?? (draft.images as string[] | undefined) ?? product.images;

  return (
    <div className="rounded-xl border border-ink-200 p-3 dark:border-ink-800">
      <div className="flex gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-ink-200 dark:border-ink-800">
          <SmartImage src={currentImages[0] || ''} alt={product.title} seed={String(product.id)} className="h-full w-full" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <input
            className={inp}
            value={String(value('title'))}
            onChange={(e) => onField(product.id, 'title', e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="Price (₦)">
              <input
                type="number"
                className={inp}
                value={String(value('price'))}
                onChange={(e) => onField(product.id, 'price', Number(e.target.value))}
              />
            </Field>
            <Field label="Quantity">
              <input
                type="number"
                className={inp}
                value={String(value('quantity'))}
                onChange={(e) => onField(product.id, 'quantity', Number(e.target.value))}
              />
            </Field>
            <Field label="Category">
              <select className={inp} value={String(value('category'))} onChange={(e) => onField(product.id, 'category', e.target.value)}>
                {Array.from(new Set([String(value('category')), ...options.categories])).filter(Boolean).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Condition">
              <select className={inp} value={String(value('condition'))} onChange={(e) => onField(product.id, 'condition', e.target.value)}>
                {options.conditions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {currentImages.map((url) => (
              <span key={url} className="relative">
                <SmartImage src={url} alt="product" seed={url} className="h-12 w-12 rounded-lg border border-ink-200 dark:border-ink-800" />
                <button
                  type="button"
                  title="Remove image"
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 px-1 text-[10px] font-bold text-white cursor-pointer"
                  onClick={() => {
                    const next = currentImages.filter((u) => u !== url);
                    setImages(next);
                    onField(product.id, 'images', next);
                  }}
                >
                  ✕
                </button>
              </span>
            ))}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              id={`product-image-${product.id}`}
              onChange={(e) =>
                onUpload(e.target.files?.[0], (url) => {
                  const next = [...currentImages, url];
                  setImages(next);
                  onField(product.id, 'images', next);
                })
              }
            />
            <label htmlFor={`product-image-${product.id}`} className={`${btnNo} cursor-pointer`}>
              <Upload className="w-3.5 h-3.5" /> Add image
            </label>
            <input
              className={`${inp} w-64`}
              placeholder="…or paste an image URL"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const url = (e.target as HTMLInputElement).value.trim();
                if (!url) return;
                const next = [...currentImages, url];
                setImages(next);
                onField(product.id, 'images', next);
                (e.target as HTMLInputElement).value = '';
              }}
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        className="mt-2 text-[11px] font-bold text-jade-600 dark:text-jade-400 cursor-pointer"
        onClick={() => setNotesOpen((v) => !v)}
      >
        {notesOpen ? 'Hide details' : 'Edit full details'}
      </button>

      {notesOpen && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Brand">
            <input className={inp} value={String(value('brand'))} onChange={(e) => onField(product.id, 'brand', e.target.value)} />
          </Field>
          <Field label="Stock status">
            <select className={inp} value={String(value('stockStatus'))} onChange={(e) => onField(product.id, 'stockStatus', e.target.value)}>
              {['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Weight (kg)">
            <input
              type="number"
              className={inp}
              value={value('weightKg') === null ? '' : String(value('weightKg'))}
              onChange={(e) => onField(product.id, 'weightKg', e.target.value === '' ? null : Number(e.target.value))}
            />
          </Field>
          <Field label="Delivery method">
            <input className={inp} value={String(value('deliveryMethod'))} onChange={(e) => onField(product.id, 'deliveryMethod', e.target.value)} />
          </Field>
          <Field label="Warranty">
            <input className={inp} value={String(value('warranty'))} onChange={(e) => onField(product.id, 'warranty', e.target.value)} />
          </Field>
          <Field label="Dimensions (cm)">
            <input className={inp} value={String(value('dimensionsCm'))} onChange={(e) => onField(product.id, 'dimensionsCm', e.target.value)} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="Return policy">
              <input className={inp} value={String(value('returnPolicy'))} onChange={(e) => onField(product.id, 'returnPolicy', e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="Description">
              <textarea
                rows={4}
                className={inp}
                value={String(value('description'))}
                onChange={(e) => onField(product.id, 'description', e.target.value)}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-ink-500">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-jade-500"
                checked={Boolean(value('pickupAvailable'))}
                onChange={(e) => onField(product.id, 'pickupAvailable', e.target.checked)}
              />
              Pickup available
            </label>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-ink-500">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-jade-500"
                checked={Boolean(value('isNegotiable'))}
                onChange={(e) => onField(product.id, 'isNegotiable', e.target.checked)}
              />
              Price negotiable
            </label>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          className={btnOk}
          disabled={Boolean(busy)}
          onClick={() => {
            const patch = { ...draft, images: currentImages };
            onSave(product.id, patch);
          }}
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> Save listing
        </button>
        <button
          className={`${btnNo} !text-red-600 dark:!text-red-400`}
          disabled={Boolean(busy)}
          onClick={() => onDelete(product.id)}
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>
    </div>
  );
}
