// components/ui/Chip.tsx
'use client';

import React from 'react';

export type ChipTone = 'jade' | 'neutral' | 'outline' | 'solid';

export interface ChipProps extends React.HTMLAttributes<HTMLElement> {
  tone?: ChipTone;
  selected?: boolean;
  icon?: React.ReactNode;
  onClick?: () => void;
}

const tones: Record<ChipTone, string> = {
  jade: 'bg-jade-500/10 text-jade-700 dark:text-jade-300 border border-jade-500/25',
  neutral:
    'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200 border border-transparent',
  outline:
    'border border-ink-300 dark:border-ink-700 text-ink-600 dark:text-ink-300 bg-transparent',
  solid: 'bg-ink-900 text-white dark:bg-white dark:text-ink-950 border border-transparent',
};

export default function Chip({
  tone = 'neutral',
  selected = false,
  icon,
  onClick,
  className = '',
  children,
  ...rest
}: ChipProps) {
  const classes = `inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold tracking-wide transition-all duration-200 ease-glide press-scale focus-ring ${
    selected
      ? 'bg-jade-500 text-white border border-jade-500 shadow-lg shadow-jade-500/25'
      : tones[tone]
  } ${className}`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`cursor-pointer ${classes}`} {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
        {icon}
        {children}
      </button>
    );
  }

  return (
    <span className={classes} {...(rest as React.HTMLAttributes<HTMLSpanElement>)}>
      {icon}
      {children}
    </span>
  );
}
