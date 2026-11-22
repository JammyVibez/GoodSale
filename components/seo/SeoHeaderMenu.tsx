'use client';

import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import AppMenuDrawer from '@/components/AppMenuDrawer';
import { PWAInstallButton } from '@/components/pwa/PWAInstallButton';

export default function SeoHeaderMenu() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <PWAInstallButton variant="compact" className="hidden sm:inline-flex" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open GoodSale directory"
          className="grid h-10 w-10 place-items-center rounded-full border border-ink-200 text-ink-700 transition-colors hover:bg-ink-100 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800 cursor-pointer"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <AppMenuDrawer isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
