// components/LogoIcon.tsx
'use client';

import React from 'react';

interface LogoIconProps {
  className?: string;
  size?: number;
  variant?: 'outline' | 'solid' | 'gold' | 'dark';
}

export function LogoIcon({ className = '', size = 24, variant = 'solid' }: LogoIconProps) {
  // SVG paint servers are scoped per instance, so every logo gets its own ids.
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const greenId = `gs-green-${uid}`;
  const goldId = `gs-gold-${uid}`;
  const darkId = `gs-dark-${uid}`;
  const checkId = `gs-check-${uid}`;
  const handleId = `gs-handle-${uid}`;
  const rivetId = `gs-rivet-${uid}`;

  const isOutline = variant === 'outline';
  const isGold = variant === 'gold';
  const isDark = variant === 'dark';

  const bagFill = isOutline
    ? 'none'
    : isGold
    ? `url(#${goldId})`
    : isDark
    ? `url(#${darkId})`
    : `url(#${greenId})`;

  const bagStroke = isOutline ? 'currentColor' : 'none';
  const checkFill = isOutline ? 'none' : isGold ? '#ffffff' : `url(#${checkId})`;
  const checkStroke = isOutline ? 'currentColor' : 'none';
  const handleStroke = isOutline ? 'currentColor' : `url(#${handleId})`;
  const rivetFill = isOutline ? 'currentColor' : `url(#${rivetId})`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      focusable="false"
    >
      <defs>
        {/* Aurora jade Shield-Bag Gradient — the one GoodSale green */}
        <linearGradient id={greenId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1FB377" />
          <stop offset="100%" stopColor="#085C34" />
        </linearGradient>

        {/* Soft Mint Bag Gradient (light variant) */}
        <linearGradient id={goldId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#5CD89F" />
          <stop offset="100%" stopColor="#0A854B" />
        </linearGradient>

        {/* Deep Ink Bag Gradient (Dark variant) */}
        <linearGradient id={darkId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3D4642" />
          <stop offset="100%" stopColor="#0B0F0D" />
        </linearGradient>

        {/* Sweeping White Checkmark Gradient */}
        <linearGradient id={checkId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#D2F7E2" />
        </linearGradient>

        {/* Rounded Handle Gradient */}
        <linearGradient id={handleId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="50%" stopColor="#EDFCF3" />
          <stop offset="100%" stopColor="#FFFFFF" />
        </linearGradient>

        {/* Rivets Gradient */}
        <linearGradient id={rivetId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#EDFCF3" />
        </linearGradient>
      </defs>

      {/* Bag Handle */}
      <path
        d="M 36 32 C 36 12, 64 12, 64 32"
        stroke={handleStroke}
        strokeWidth={isOutline ? "3" : "4.5"}
        strokeLinecap="round"
        fill="none"
      />

      {/* Rivets/Grommets */}
      <circle cx="36" cy="32" r="3" fill={rivetFill} />
      <circle cx="64" cy="32" r="3" fill={rivetFill} />

      {/* Shield-Shaped Shopping Bag Body */}
      <path
        d="M 28,32 L 72,32 C 76,32 79,35 79,39 L 76,64 C 75,76 64,86 50,86 C 36,86 25,76 24,64 L 21,39 C 21,35 24,32 28,32 Z"
        fill={bagFill}
        stroke={bagStroke}
        strokeWidth={isOutline ? "3" : "0"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Sweeping Premium Checkmark / Swoosh */}
      <path
        d="M 18,52 C 28,68 38,80 50,80 C 66,80 84,56 98,36 C 82,48 66,66 50,66 C 35,66 25,56 18,52 Z"
        fill={checkFill}
        stroke={checkStroke}
        strokeWidth={isOutline ? "2.5" : "0"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface LogoProps {
  className?: string;
  iconSize?: number;
  textColorClass?: string;
  subtitleColorClass?: string;
  /** Wordmark gradient for the "Sale" half. Defaults to the jade brand gradient. */
  accentClassName?: string;
  /** Wordmark scale; compact headers can step this down without changing the lockup. */
  wordmarkClassName?: string;
  showTagline?: boolean;
  variant?: 'solid' | 'outline' | 'gold' | 'dark';
}

export default function Logo({
  className = '',
  iconSize = 32,
  textColorClass = 'text-ink-950 dark:text-white',
  subtitleColorClass = 'text-ink-400 dark:text-ink-400',
  accentClassName = 'from-jade-500 to-jade-700 dark:from-jade-300 dark:to-jade-500',
  wordmarkClassName = 'text-lg sm:text-xl',
  showTagline = true,
  variant = 'solid',
}: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoIcon size={iconSize} variant={variant} />
      <div className="flex flex-col justify-center">
        {/* Geometric sans-serif with the single Aurora jade gradient wordmark */}
        <div className={`font-sans font-bold leading-none tracking-tight ${wordmarkClassName} ${textColorClass}`}>
          Good<span className={`bg-gradient-to-r ${accentClassName} bg-clip-text font-bold text-transparent`}>Sale</span>
        </div>
        {showTagline && (
          <p className={`mt-1 text-[10px] font-semibold leading-none tracking-wider ${subtitleColorClass}`}>
            Buy. Sell. Trust.
          </p>
        )}
      </div>
    </div>
  );
}
