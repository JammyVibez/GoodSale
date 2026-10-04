// components/ui/SegmentedControl.tsx
'use client';

import React from 'react';

export interface SegmentedOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  'aria-label'?: string;
}

/**
 * Sliding pill segmented control. The pill travels between options with the
 * spring easing token — overshoot, settle.
 */
export default function SegmentedControl({
  options,
  value,
  onChange,
  className = '',
  'aria-label': ariaLabel,
}: SegmentedControlProps) {
  const activeIndex = Math.max(
    0,
    options.findIndex((opt) => opt.value === value)
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`relative grid rounded-2xl bg-ink-100 p-1 dark:bg-ink-800 ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1 bottom-1 left-1 rounded-xl bg-white shadow-md shadow-ink-900/10 transition-transform duration-300 ease-spring dark:bg-ink-950"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      />
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`relative z-10 inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-black tracking-tight transition-colors duration-200 focus-ring cursor-pointer ${
              active
                ? 'text-jade-600 dark:text-jade-300'
                : 'text-ink-500 hover:text-ink-700 dark:hover:text-ink-300'
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
