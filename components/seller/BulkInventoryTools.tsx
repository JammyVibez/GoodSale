'use client';

import React, { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import type { Product } from '@/lib/types';
import { reloadFromSupabase } from '@/lib/store';
import { toast } from '@/lib/feedback';

type Row = { productId: number; price?: number; quantity?: number; stockStatus?: string };

function parseCsv(text: string): Row[] {
  const lines = text.replace(/\r/g, '').split('\n').filter((line) => line.trim());
  if (lines.length < 2) throw new Error('CSV needs a header row and at least one product row');
  const headers = lines[0].split(',').map((header) => header.trim().toLowerCase());
  const idIndex = headers.findIndex((header) => ['id', 'product_id', 'productid'].includes(header));
  if (idIndex < 0) throw new Error('CSV needs an id column');
  const priceIndex = headers.findIndex((header) => header === 'price');
  const quantityIndex = headers.findIndex((header) => ['quantity', 'stock', 'qty'].includes(header));
  const statusIndex = headers.findIndex((header) => ['stock_status', 'status', 'stockstatus'].includes(header));

  return lines.slice(1).map((line, index) => {
    const cells = line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''));
    const productId = Number(cells[idIndex]);
    if (!Number.isInteger(productId) || productId <= 0) throw new Error(`Line ${index + 2}: invalid product id`);
    return {
      productId,
      price: priceIndex >= 0 && cells[priceIndex] ? Number(cells[priceIndex]) : undefined,
      quantity: quantityIndex >= 0 && cells[quantityIndex] ? Number(cells[quantityIndex]) : undefined,
      stockStatus: statusIndex >= 0 && cells[statusIndex] ? cells[statusIndex].toUpperCase() : undefined,
    };
  });
}

export default function BulkInventoryTools({ products }: { products: Product[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const exportCsv = () => {
    const rows = [
      ['id', 'title', 'price', 'quantity', 'stock_status'],
      ...products.map((product) => [
        String(product.id),
        `"${product.title.replace(/"/g, '""')}"`,
        String(product.price),
        String(product.quantity),
        product.stockStatus,
      ]),
    ];
    const blob = new Blob([rows.map((row) => row.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `goodsale-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file: File) => {
    setBusy(true);
    try {
      const rows = parseCsv(await file.text());
      const res = await fetch('/api/seller/inventory/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) throw new Error(payload.error || 'Bulk update failed');
      toast.success(`${payload.updated} listings updated from CSV`);
      await reloadFromSupabase();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Bulk update failed');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="rounded-2xl border border-ink-200 bg-ink-50/60 p-4 dark:border-ink-800 dark:bg-ink-950/40">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="flex items-center gap-2 text-xs font-bold text-ink-800 dark:text-white">
            <FileSpreadsheet className="h-4 w-4 text-jade-600" /> Business bulk inventory
          </h4>
          <p className="mt-1 text-[10px] leading-relaxed text-ink-400">
            Export your catalog, edit <span className="font-mono">price</span>, <span className="font-mono">quantity</span> and{' '}
            <span className="font-mono">stock_status</span>, then import up to 250 rows. Ownership is rechecked server-side.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={!products.length}
            className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs font-bold text-ink-600 hover:bg-ink-50 disabled:opacity-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-jade-600 px-3 py-2 text-xs font-bold text-white hover:bg-jade-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Import CSV
          </button>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importCsv(file);
        }}
      />
    </div>
  );
}
