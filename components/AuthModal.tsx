// components/AuthModal.tsx
'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The premium authentication screens are full routes (`/auth`,
 * `/auth/register`), so this keeps the existing `onOpenAuth` call sites
 * working by sending the visitor there instead of rendering a second,
 * divergent copy of the forms in a dialog.
 */
interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Kept for call-site compatibility; the routed page owns the success flow. */
  onSuccess?: () => void;
  initialMode?: 'login' | 'register';
}

export default function AuthModal({ isOpen, onClose, initialMode = 'login' }: AuthModalProps) {
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      handled.current = false;
      return;
    }
    if (handled.current) return;
    handled.current = true;

    const path =
      typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.search}`;
    const base = initialMode === 'register' ? '/auth/register' : '/auth';
    // Deep links (a product, a seller, a shipment) come back after auth; a plain
    // marketplace visit lets the destination rules pick buyer vs seller.
    const query = path && path !== '/' ? `?next=${encodeURIComponent(path)}` : '';

    onClose();
    router.push(`${base}${query}`);
  }, [isOpen, initialMode, onClose, router]);

  return null;
}
