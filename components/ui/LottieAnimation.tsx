// components/ui/LottieAnimation.tsx
'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const Lottie = dynamic(() => import('lottie-react').then((mod) => mod.Lottie) as any, {
  ssr: false,
}) as React.ComponentType<any>;

interface LottieAnimationProps {
  animationData: unknown;
  className?: string;
  loop?: boolean;
  autoplay?: boolean;
}

/**
 * SSR-safe Lottie wrapper. lottie-react is only safe on the client, so we
 * dynamic-import it — the component itself never touches the server bundle.
 * Reduced-motion visitors get the static first frame instead of playback.
 */
export default function LottieAnimation({
  animationData,
  className,
  loop = true,
  autoplay = true,
}: LottieAnimationProps) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return (
    <Lottie
      // lottie-react v3 expects `src` (a path or the parsed animation). Passing
      // `animationData` here is silently ignored and forwarded to the DOM, so
      // the animation never loads — this wrapper keeps its own prop name and
      // maps it to the v3 API at the boundary.
      src={animationData as object}
      loop={loop}
      autoplay={autoplay && !reduceMotion}
      className={className}
      aria-hidden="true"
    />
  );
}
