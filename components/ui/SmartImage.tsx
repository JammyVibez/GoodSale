// components/ui/SmartImage.tsx
'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';

function getInitials(name?: string | null): string {
  if (!name) return 'GS';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Gradients rotate deterministically per seed so the same user always gets
 * the same placeholder — no external placeholder service involved.
 */
const GRADIENTS = [
  'from-emerald-500 via-teal-500 to-cyan-500',
  'from-orange-500 via-amber-500 to-yellow-500',
  'from-violet-500 via-purple-500 to-fuchsia-500',
  'from-rose-500 via-pink-500 to-orange-400',
  'from-sky-500 via-blue-500 to-indigo-500',
  'from-emerald-600 via-green-500 to-lime-500',
];

function gradientFor(seed?: string | null): string {
  if (!seed) return GRADIENTS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

interface SmartImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
  seed?: string | null;
  rounded?: boolean;
}

/**
 * Image that renders the real (Supabase Storage) URL when available and a
 * themed gradient placeholder otherwise. Falls back to the placeholder on
 * load error so broken links never show a broken image icon.
 */
export function SmartImage({
  src,
  alt = '',
  className = '',
  imgClassName = 'w-full h-full object-cover',
  seed,
  rounded = false,
}: SmartImageProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div
      className={`relative overflow-hidden ${rounded ? 'rounded-full' : ''} ${
        showImage ? '' : `bg-gradient-to-br ${gradientFor(seed || src)}`
      } ${className}`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt={alt}
          className={imgClassName}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-white/90">
          <ImageOff className="w-1/3 h-1/3 opacity-70" strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
}

interface SmartAvatarProps {
  src?: string | null;
  name?: string | null;
  seed?: string | null;
  className?: string;
  imgClassName?: string;
}

/**
 * Circular avatar with initials monogram fallback — used for users, sellers,
 * couriers and reviewers across the app.
 */
export function SmartAvatar({
  src,
  name,
  seed,
  className = '',
  imgClassName = 'w-full h-full object-cover',
}: SmartAvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  const fallbackSeed = seed || name || 'user';

  return (
    <div
      className={`relative overflow-hidden rounded-full ${
        showImage ? '' : `bg-gradient-to-br ${gradientFor(fallbackSeed)}`
      } ${className}`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt={name || 'avatar'}
          className={imgClassName}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-white font-bold text-[40%] tracking-wide">
          {getInitials(name)}
        </div>
      )}
    </div>
  );
}
