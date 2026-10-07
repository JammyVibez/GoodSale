// components/LogoIcon.tsx
'use client';

import React from 'react';

interface LogoIconProps {
  className?: string;
  size?: number;
  variant?: 'outline' | 'solid' | 'gold' | 'dark';
}

export function LogoIcon({ className = '', size = 24, variant = 'solid' }: LogoIconProps) {
  // Define custom styles and color sets depending on variant
  const isOutline = variant === 'outline';
  const isGold = variant === 'gold';
  const isDark = variant === 'dark';

  // We define dynamic attributes based on selected variants
  const bagFill = isOutline
    ? 'none'
    : isGold
    ? 'url(#logoGoldBagGrad)'
    : isDark
    ? 'url(#logoDarkBagGrad)'
    : 'url(#logoGreenBagGrad)';

  const bagStroke = isOutline
    ? 'currentColor'
    : 'none';

  const checkFill = isOutline
    ? 'none'
    : isGold
    ? '#ffffff'
    : 'url(#logoCheckGrad)';

  const checkStroke = isOutline
    ? 'currentColor'
    : 'none';

  const handleStroke = isOutline
    ? 'currentColor'
    : 'url(#logoHandleGrad)';

  const rivetFill = isOutline
    ? 'currentColor'
    : 'url(#logoRivetGrad)';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      id="goodsale-premium-logo"
    >
      <defs>
        {/* Aurora jade Shield-Bag Gradient — the one GoodSale green */}
        <linearGradient id="logoGreenBagGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1FB377" />
          <stop offset="100%" stopColor="#085C34" />
        </linearGradient>

        {/* Soft Mint Bag Gradient (light variant) */}
        <linearGradient id="logoGoldBagGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#5CD89F" />
          <stop offset="100%" stopColor="#0A854B" />
        </linearGradient>

        {/* Deep Ink Bag Gradient (Dark variant) */}
        <linearGradient id="logoDarkBagGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3D4642" />
          <stop offset="100%" stopColor="#0B0F0D" />
        </linearGradient>

        {/* Sweeping White Checkmark Gradient */}
        <linearGradient id="logoCheckGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#D2F7E2" />
        </linearGradient>

        {/* Rounded Handle Gradient */}
        <linearGradient id="logoHandleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="50%" stopColor="#EDFCF3" />
          <stop offset="100%" stopColor="#FFFFFF" />
        </linearGradient>

        {/* Rivets Gradient */}
        <linearGradient id="logoRivetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
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
  variant?: 'solid' | 'outline' | 'gold' | 'dark';
}

export default function Logo({
  className = '',
  iconSize = 32,
  textColorClass = 'text-ink-950 dark:text-white',
  subtitleColorClass = 'text-ink-400 dark:text-ink-500',
  variant = 'solid',
}: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`} id="goodsale-branded-logo">
      <LogoIcon size={iconSize} variant={variant} />
      <div className="flex flex-col justify-center">
        {/* Geometric sans-serif with the single Aurora jade gradient wordmark */}
        <h1 className={`font-sans font-bold tracking-tight leading-none text-lg sm:text-xl ${textColorClass}`}>
          Good<span className="bg-gradient-to-r from-[#1FB377] to-[#0A854B] dark:from-[#5CD89F] dark:to-[#1FB377] bg-clip-text text-transparent font-bold">Sale</span>
        </h1>
        <p className={`text-[10px] tracking-wider leading-none mt-1 font-semibold ${subtitleColorClass}`}>
          Buy. Sell. Trust.
        </p>
      </div>
    </div>
  );
}
