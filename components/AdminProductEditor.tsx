// components/AdminProductEditor.tsx
'use client';

/**
 * Admin → Products → Edit.
 *
 * Full editor for any listing (real seller or seeded): title, price, stock,
 * category, brand, condition, description, delivery terms and photos, plus an
 * optional product video. Photos and the video can be uploaded from the device
 * (Cloudinary/Supabase Storage via /api/upload) or pasted as a URL, removed
 * individually, and the whole listing can be deleted.
 */
import React, { useState } from 'react';
import { Loader2, Upload, Trash2, Save, Film, Plus, X, Link2 } from 'lucide-react';
import { toast, confirmDialog } from '@/lib/feedback';
import { uploadMedia } from '@/lib/upload';
import { SmartImage } from './ui/SmartImage';
import { dbOperations, ProductCondition, type Product } from '@/lib/store';

const inp =
  'w-full bg-ink-50 dark:bg-ink-950 border border-ink-200 dark:border-ink-800 px-3 py-2 rounded-xl text-xs text-ink-800 dark:text-ink-200 focus:outline-none focus:ring-1 focus:ring-jade-500';
const btnOk =
  'px-3 py-1.5 bg-jade-500 hover:bg-jade-600 text-white font-bold text-xs rounded-lg transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5';
const btnNo =
  'px-3 py-1.5 bg-white dark:bg-ink-900 text-ink-600 dark:text-ink-300 hover:bg-ink-500/10 border border-ink-200 dark:border-ink-800 font-bold text-xs rounded-lg transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5';

const CONDITIONS = Object.values(ProductCondition);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-bold text-ink-500">{label}</span>
      {children}
    </label>
  );
}

function toggle(label: string, checked: boolean, onChange: (v: boolean) => void) {
  return (
    <label className="flex items-center gap-2 text-xs font-bold text-ink-600 dark:text-ink-300 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-jade-500" />
      {label}
    </label>
  );
}

export default function AdminProductEditor({ product, onDone }: { product: Product; onDone?: () => void }) {
  const [draft, setDraft] = useState(() => ({
    title: product.title,
    description: product.description,
    price: String(product.price),
    compareAtPrice: String(product.compareAtPrice ?? ''),
    quantity: String(product.quantity),
    stockStatus: product.stockStatus,
    category: product.category,
    brand: product.brand,
    condition: product.condition as ProductCondition,
    warranty: product.warranty ?? '',
    returnPolicy: product.returnPolicy ?? '',
    deliveryMethod: product.deliveryMethod,
    dimensionsCm: product.dimensionsCm ?? '',
    weightKg: String(product.weightKg ?? ''),
    isNegotiable: product.isNegotiable,
    pickupAvailable: product.pickupAvailable,
  }));
  const [images, setImages] = useState<string[]>(product.images || []);
  const [videoUrl, setVideoUrl] = useState(product.videoUrl ?? '');
  const [imageUrl, setImageUrl] = useState('');
  const [videoInput, setVideoInput] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const upload = async (file: File | undefined, kind: 'image' | 'video') => {
    if (!file) return;
    setError('');
    setBusy(kind === 'video' ? 'upload-video' : 'upload-image');
    try {
      const url = await uploadMedia(file, 'product-images');
      if (kind === 'video') setVideoUrl(url);
      else setImages((list) => [...list, url]);
      toast.success(kind === 'video' ? 'Video uploaded' : 'Image uploaded');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    setError('');
    setBusy('save');
    try {
      const res = await dbOperations.adminUpdateProduct(product.id, {
        title: draft.title.trim() || product.title,
        description: draft.description,
        price: parseFloat(draft.price) || 0,
        compareAtPrice: parseFloat(draft.compareAtPrice) || 0,
        quantity: parseInt(draft.quantity, 10) || 0,
        stockStatus: draft.stockStatus,
        category: draft.category,
        brand: draft.brand,
        condition: draft.condition,
        images,
        videoUrl,
        warranty: draft.warranty,
        returnPolicy: draft.returnPolicy,
        deliveryMethod: draft.deliveryMethod,
        dimensionsCm: draft.dimensionsCm,
        weightKg: parseFloat(draft.weightKg) || 0,
        isNegotiable: draft.isNegotiable,
        pickupAvailable: draft.pickupAvailable,
      });
      if (res && 'error' in res && res.error) throw new Error(res.error);
      toast.success('Product updated');
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update product');
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete product', message: `Delete “${product.title}”? This cannot be undone.`, confirmText: 'Delete', danger: true }))) return;
    setBusy('delete');
    try {
      const res = await dbOperations.adminDeleteProduct(product.id);
      if (res && 'error' in res && res.error) throw new Error(res.error);
      toast.success('Product deleted');
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete product');
      setBusy('');
    }
  };

  return (
    <div className="p-4 space-y-4 bg-ink-50/60 dark:bg-ink-950/40">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Title">
          <input className={inp} value={draft.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Field label="Price ₦">
            <input type="number" className={inp} value={draft.price} onChange={(e) => set('price', e.target.value)} />
          </Field>
          <Field label="Compare-at ₦">
            <input type="number" className={inp} value={draft.compareAtPrice} onChange={(e) => set('compareAtPrice', e.target.value)} placeholder="optional" />
          </Field>
          <Field label="Quantity">
            <input type="number" className={inp} value={draft.quantity} onChange={(e) => set('quantity', e.target.value)} />
          </Field>
          <Field label="Stock">
            <select className={inp} value={draft.stockStatus} onChange={(e) => set('stockStatus', e.target.value as Product['stockStatus'])}>
              <option value="IN_STOCK">IN_STOCK</option>
              <option value="LOW_STOCK">LOW_STOCK</option>
              <option value="OUT_OF_STOCK">OUT_OF_STOCK</option>
            </select>
          </Field>
        </div>
      </div>

      <Field label="Description">
        <textarea rows={3} className={inp} value={draft.description} onChange={(e) => set('description', e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Category">
          <input className={inp} value={draft.category} onChange={(e) => set('category', e.target.value)} />
        </Field>
        <Field label="Brand">
          <input className={inp} value={draft.brand} onChange={(e) => set('brand', e.target.value)} />
        </Field>
        <Field label="Condition">
          <select className={inp} value={draft.condition} onChange={(e) => set('condition', e.target.value as ProductCondition)}>
            {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Dimensions (cm)">
          <input className={inp} value={draft.dimensionsCm} onChange={(e) => set('dimensionsCm', e.target.value)} />
        </Field>
        <Field label="Warranty">
          <input className={inp} value={draft.warranty} onChange={(e) => set('warranty', e.target.value)} />
        </Field>
        <Field label="Return policy">
          <input className={inp} value={draft.returnPolicy} onChange={(e) => set('returnPolicy', e.target.value)} />
        </Field>
        <Field label="Delivery method">
          <input className={inp} value={draft.deliveryMethod} onChange={(e) => set('deliveryMethod', e.target.value)} />
        </Field>
        <Field label="Weight (kg)">
          <input type="number" step="0.1" className={inp} value={draft.weightKg} onChange={(e) => set('weightKg', e.target.value)} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-4">
        {toggle('Negotiable', draft.isNegotiable, (v) => set('isNegotiable', v))}
        {toggle('Pickup available', draft.pickupAvailable, (v) => set('pickupAvailable', v))}
      </div>

      {/* Photos */}
      <div className="space-y-2">
        <span className="text-[11px] font-bold text-ink-500">Photos</span>
        <div className="flex flex-wrap gap-2">
          {images.map((url) => (
            <span key={url} className="relative">
              <SmartImage src={url} alt="product" seed={url} className="h-16 w-16 rounded-lg border border-ink-200 dark:border-ink-800" />
              <button
                type="button"
                title="Remove image"
                onClick={() => setImages((list) => list.filter((u) => u !== url))}
                className="absolute -top-1.5 -right-1.5 bg-ink-900 text-white rounded-full p-0.5 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {images.length === 0 && <span className="text-xs text-ink-400">No photos yet.</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${btnNo} cursor-pointer`}>
            {busy === 'upload-image' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Upload photo
            <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0], 'image')} />
          </label>
          <div className="flex items-center gap-1.5 flex-1 min-w-[220px]">
            <input className={inp} placeholder="…or paste an image URL" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
            <button
              type="button"
              className={btnNo}
              onClick={() => {
                const url = imageUrl.trim();
                if (!url) return;
                setImages((list) => [...list, url]);
                setImageUrl('');
              }}
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
        </div>
      </div>

      {/* Video */}
      <div className="space-y-2">
        <span className="text-[11px] font-bold text-ink-500 flex items-center gap-1.5">
          <Film className="w-3.5 h-3.5" /> Product video
        </span>
        {videoUrl ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <video src={videoUrl} controls muted playsInline className="h-24 w-40 rounded-lg bg-black object-cover border border-ink-200 dark:border-ink-800" />
            <button type="button" className={btnNo} onClick={() => setVideoUrl('')}>
              <X className="w-3.5 h-3.5" /> Remove video
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label className={`${btnNo} cursor-pointer`}>
              {busy === 'upload-video' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Upload video
              <input type="file" accept="video/*" className="hidden" onChange={(e) => upload(e.target.files?.[0], 'video')} />
            </label>
            <div className="flex items-center gap-1.5 flex-1 min-w-[220px]">
              <input className={inp} placeholder="…or paste a video URL (mp4/webm)" value={videoInput} onChange={(e) => setVideoInput(e.target.value)} />
              <button type="button" className={btnNo} onClick={() => { const url = videoInput.trim(); if (!url) return; setVideoUrl(url); setVideoInput(''); }}>
                <Link2 className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-xs font-bold text-red-500">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!!busy} className={btnOk} onClick={save}>
          {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save changes
        </button>
        <button type="button" disabled={!!busy} className={btnNo} onClick={remove}>
          {busy === 'delete' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Delete
        </button>
      </div>
    </div>
  );
}
