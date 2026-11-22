'use client';

import { RefreshCw } from 'lucide-react';

export default function RetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-jade-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-jade-700"
    >
      <RefreshCw className="h-4 w-4" aria-hidden="true" />
      Try again
    </button>
  );
}
