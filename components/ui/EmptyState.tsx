// components/ui/EmptyState.tsx
'use client';

import React from 'react';
import LottieAnimation from './LottieAnimation';
import { lottieStates, type LottieState } from '../../lib/lottie/states';

export interface EmptyStateProps {
  /** Which mapped Lottie state to play (empty-search / empty-cart / empty-chat / error …). */
  state: LottieState;
  /** Static icon rendered underneath the animation — the always-on fallback. */
  icon: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  /** Primary action — one button, the next best step. */
  action?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: { host: 'h-24 w-24', icon: 'h-8 w-8', title: 'text-sm', body: 'text-xs' },
  md: { host: 'h-36 w-36', icon: 'h-12 w-12', title: 'text-lg', body: 'text-sm' },
  lg: { host: 'h-44 w-44', icon: 'h-16 w-16', title: 'text-xl', body: 'text-sm' },
};

/**
 * Empty / error state with a mapped Lottie moment and a static icon
 * fallback underneath it, so the state still reads if Lottie is slow,
 * blocked, or reduced-motion.
 */
export default function EmptyState({
  state,
  icon,
  title,
  description,
  action,
  size = 'md',
  className = '',
}: EmptyStateProps) {
  const s = sizes[size];

  return (
    <div
      className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}
    >
      <div className={`lottie-host mb-4 ${s.host}`}>
        <div className={`lottie-fallback text-ink-300 dark:text-ink-700 ${s.icon}`}>{icon}</div>
        <div className="lottie-layer h-full w-full">
          <LottieAnimation animationData={lottieStates[state]} className="h-full w-full" />
        </div>
      </div>
      <h3 className={`font-bold tracking-tight text-ink-900 dark:text-white ${s.title}`}>
        {title}
      </h3>
      {description && (
        <p
          className={`mt-2 max-w-sm leading-relaxed text-ink-500 ${s.body}`}
        >
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
