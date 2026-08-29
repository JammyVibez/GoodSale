// components/ui/LottieAnimation.tsx
'use client';

import React from 'react';
import dynamic from 'next/dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Lottie = dynamic(() => import('lottie-react') as any, { ssr: false }) as React.ComponentType<any>;

interface LottieAnimationProps {
  animationData: unknown;
  className?: string;
  loop?: boolean;
  autoplay?: boolean;
}

/**
 * SSR-safe Lottie wrapper. lottie-react is only safe on the client, so we
 * dynamic-import it — the component itself never touches the server bundle.
 */
export default function LottieAnimation({
  animationData,
  className,
  loop = true,
  autoplay = true,
}: LottieAnimationProps) {
  return (
    <Lottie
      animationData={animationData as object}
      loop={loop}
      autoplay={autoplay}
      className={className}
      aria-hidden="true"
    />
  );
}
