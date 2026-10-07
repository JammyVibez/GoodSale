// components/ui/Meter.tsx
'use client';

import React from 'react';

export interface MeterProps {
  label?: string;
  value: number;
  max?: number;
  showValue?: boolean;
  tone?: 'jade' | 'ink';
  caption?: React.ReactNode;
  className?: string;
}

/**
 * Tonal progress meter — jade fill for progress, ink for neutral scales.
 * Width transitions use the glide easing token.
 */
export default function Meter({
  label,
  value,
  max = 100,
  showValue = false,
  tone = 'jade',
  caption,
  className = '',
}: MeterProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          {label && (
            <span className="text-xs font-bold tracking-wide text-ink-500">{label}</span>
          )}
          {showValue && (
            <span className="font-mono text-xs font-semibold tabular-nums text-ink-800 dark:text-ink-200">
              {Math.round(pct)}%
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2.5 w-full overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-glide ${
            tone === 'jade'
              ? 'bg-jade-500 shadow-[0_0_10px_rgba(10,133,75,0.45)]'
              : 'bg-ink-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {caption && (
        <p className="mt-1.5 text-xs font-medium text-ink-500">{caption}</p>
      )}
    </div>
  );
}
