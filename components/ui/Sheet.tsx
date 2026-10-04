// components/ui/Sheet.tsx
'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Bottom sheet — rises with the sheet-rise spring (overshoot, settle).
 * Closes on Escape and backdrop tap.
 */
export default function Sheet({ open, onClose, title, children, className = '' }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90]">
      <div
        className="absolute inset-0 bg-ink-950/60 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute inset-x-0 bottom-0 mx-auto max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border-x border-t border-ink-200 bg-white shadow-2xl animate-sheet-rise pb-safe-bottom dark:border-ink-800 dark:bg-ink-900 ${className}`}
      >
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-xl dark:bg-ink-900/90">
          <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-ink-200 dark:bg-ink-700" />
          <div className="flex items-center justify-between px-6 pt-3 pb-2">
              <h3 className="text-base font-black tracking-tight text-ink-900 dark:text-white">
                {title}
              </h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-full bg-ink-100 p-2 text-ink-500 transition-colors hover:text-ink-900 focus-ring cursor-pointer dark:bg-ink-800 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
        </div>
        <div className="px-6 pb-8 pt-2">{children}</div>
      </div>
    </div>
  );
}
