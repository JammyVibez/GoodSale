// components/ui/Dialog.tsx
'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
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

  const dialog = (
    <div className="fixed inset-0 z-[95] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-ink-950/60 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[calc(100dvh-0.5rem)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-ink-200 bg-white shadow-2xl animate-fade-in-scale pb-safe-bottom dark:border-ink-800 dark:bg-ink-900 sm:max-h-[85dvh] sm:rounded-3xl ${className}`}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-ink-200 dark:bg-ink-700 sm:hidden" />
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3 pt-4 sm:px-6 sm:pb-4 sm:pt-6">
          <div className="min-w-0">
            {title && (
              <h3 className="text-lg font-bold tracking-tight text-ink-900 dark:text-white">
                {title}
              </h3>
            )}
            {description && (
              <p className="mt-1 text-sm leading-relaxed text-ink-500 dark:text-ink-400">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full bg-ink-100 p-2 text-ink-500 transition-colors hover:text-ink-900 focus-ring cursor-pointer dark:bg-ink-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6 sm:pb-6">
          {children}
        </div>
      </div>
    </div>
  );

  // Render at the document root so no parent transform, overflow or stacking
  // context can clip the dialog on small screens.
  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
}
