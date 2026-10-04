// components/ui/Dialog.tsx
'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Centered dialog — scales in with the fade-in-scale spring.
 * Closes on Escape and backdrop tap.
 */
export default function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className = '',
}: DialogProps) {
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
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink-950/60 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full max-w-md rounded-3xl border border-ink-200 bg-white p-6 shadow-2xl animate-fade-in-scale dark:border-ink-800 dark:bg-ink-900 ${className}`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && (
              <h3 className="text-lg font-black tracking-tight text-ink-900 dark:text-white">
                {title}
              </h3>
            )}
            {description && (
              <p className="mt-1 text-sm leading-relaxed text-ink-500">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full bg-ink-100 p-2 text-ink-500 transition-colors hover:text-ink-900 focus-ring cursor-pointer dark:bg-ink-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
