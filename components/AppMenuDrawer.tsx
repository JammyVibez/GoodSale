'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  X,
  ShieldCheck,
  Mail,
  ChevronRight,
  Store,
  ShoppingBag,
  HelpCircle,
  FileText,
  Truck,
  Twitter,
  Instagram,
  Facebook,
  Linkedin,
} from 'lucide-react';
import Logo from '@/components/LogoIcon';
import { PWAInstallButton } from '@/components/pwa/PWAInstallButton';

interface AppMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional SPA navigator used inside the interactive app shell (`app/page.tsx`). */
  onNavigate?: (view: string, payload?: unknown) => void;
}

export default function AppMenuDrawer({
  isOpen,
  onClose,
  onNavigate,
}: AppMenuDrawerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const navigateView = (view: string) => {
    onClose();
    if (onNavigate) {
      onNavigate(view);
    }
  };

  const renderAction = (label: string, view: string, fallbackHref: string) => {
    if (onNavigate) {
      return (
        <button
          type="button"
          onClick={() => navigateView(view)}
          className="flex min-h-[42px] w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100 hover:text-jade-700 dark:text-ink-200 dark:hover:bg-ink-800/80 dark:hover:text-jade-300 cursor-pointer"
        >
          <span>{label}</span>
          <ChevronRight className="h-4 w-4 text-ink-400" aria-hidden="true" />
        </button>
      );
    }
    return (
      <Link
        href={fallbackHref}
        onClick={onClose}
        className="flex min-h-[42px] w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100 hover:text-jade-700 dark:text-ink-200 dark:hover:bg-ink-800/80 dark:hover:text-jade-300"
      >
        <span>{label}</span>
        <ChevronRight className="h-4 w-4 text-ink-400" aria-hidden="true" />
      </Link>
    );
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="GoodSale directory"
      className="fixed inset-0 z-[130] flex justify-end bg-black/50 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-sm flex-col border-l border-ink-200 bg-white shadow-2xl pt-safe-top pb-safe-bottom dark:border-ink-800 dark:bg-ink-950 animate-slide-in-right"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4 dark:border-ink-800">
          <Logo
            iconSize={32}
            textColorClass="text-ink-900 dark:text-white"
            subtitleColorClass="text-ink-400 dark:text-ink-500"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close directory"
            className="grid h-10 w-10 place-items-center rounded-full text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable directory links (relocated from footer) */}
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* App & iOS installation card */}
          <PWAInstallButton variant="card" showDesktopFallback />

          {/* Marketplace */}
          <section aria-labelledby="dir-marketplace">
            <h2
              id="dir-marketplace"
              className="mb-2 flex items-center gap-2 px-3 text-xs font-bold uppercase tracking-wider text-ink-400"
            >
              <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
              Marketplace
            </h2>
            <div className="space-y-0.5">
              {renderAction('Browse listings', 'marketplace', '/')}
              {[
                { href: '/categories', label: 'Categories' },
                { href: '/sellers', label: 'Verified sellers' },
                { href: '/flash-deals', label: 'Flash deals' },
                { href: '/best-deals', label: 'Best deals' },
                { href: '/new-arrivals', label: 'New arrivals' },
                { href: '/featured', label: 'Featured' },
                { href: '/promotions', label: 'Promoted listings' },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className="flex min-h-[42px] items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100 hover:text-jade-700 dark:text-ink-200 dark:hover:bg-ink-800/80 dark:hover:text-jade-300"
                >
                  <span>{item.label}</span>
                  <ChevronRight className="h-4 w-4 text-ink-400" aria-hidden="true" />
                </Link>
              ))}
              {renderAction('Your cart', 'cart', '/?view=cart')}
              {renderAction('Refer & earn Coins', 'referrals', '/?view=referrals')}
            </div>
          </section>

          {/* Selling */}
          <section aria-labelledby="dir-selling">
            <h2
              id="dir-selling"
              className="mb-2 flex items-center gap-2 px-3 text-xs font-bold uppercase tracking-wider text-ink-400"
            >
              <Store className="h-3.5 w-3.5" aria-hidden="true" />
              Selling &amp; Payouts
            </h2>
            <div className="space-y-0.5">
              {renderAction('Start selling / Seller hub', 'dashboard', '/?view=dashboard')}
              {renderAction('Account type & Settings', 'settings', '/?view=settings')}
              {renderAction('Payouts & wallet', 'wallet', '/?view=wallet')}
            </div>
          </section>

          {/* Support & Tracking */}
          <section aria-labelledby="dir-support">
            <h2
              id="dir-support"
              className="mb-2 flex items-center gap-2 px-3 text-xs font-bold uppercase tracking-wider text-ink-400"
            >
              <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Support &amp; Delivery
            </h2>
            <div className="space-y-0.5">
              <Link
                href="/track"
                onClick={onClose}
                className="flex min-h-[42px] items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100 hover:text-jade-700 dark:text-ink-200 dark:hover:bg-ink-800/80 dark:hover:text-jade-300"
              >
                <span className="inline-flex items-center gap-2">
                  <Truck className="h-4 w-4 text-jade-600 dark:text-jade-400" aria-hidden="true" />
                  Track a shipment
                </span>
                <ChevronRight className="h-4 w-4 text-ink-400" aria-hidden="true" />
              </Link>
              <Link
                href="/trust-safety"
                onClick={onClose}
                className="flex min-h-[42px] items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100 hover:text-jade-700 dark:text-ink-200 dark:hover:bg-ink-800/80 dark:hover:text-jade-300"
              >
                <span>Trust &amp; Safety Centre</span>
                <ChevronRight className="h-4 w-4 text-ink-400" aria-hidden="true" />
              </Link>
              {renderAction('Help centre', 'support', '/?view=support')}
              {renderAction('Chat with a seller', 'chats', '/?view=chats')}
              <a
                href="mailto:support@goodsale.ng"
                className="flex min-h-[42px] items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100 hover:text-jade-700 dark:text-ink-200 dark:hover:bg-ink-800/80 dark:hover:text-jade-300"
              >
                <Mail className="h-4 w-4 text-ink-400" aria-hidden="true" />
                <span>support@goodsale.ng</span>
              </a>
            </div>
          </section>

          {/* Legal */}
          <section aria-labelledby="dir-legal">
            <h2
              id="dir-legal"
              className="mb-2 flex items-center gap-2 px-3 text-xs font-bold uppercase tracking-wider text-ink-400"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              Legal
            </h2>
            <div className="space-y-0.5">
              <Link
                href="/terms"
                onClick={onClose}
                className="flex min-h-[42px] items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100 hover:text-jade-700 dark:text-ink-200 dark:hover:bg-ink-800/80 dark:hover:text-jade-300"
              >
                <span>Terms of Service</span>
                <ChevronRight className="h-4 w-4 text-ink-400" aria-hidden="true" />
              </Link>
              <Link
                href="/privacy"
                onClick={onClose}
                className="flex min-h-[42px] items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100 hover:text-jade-700 dark:text-ink-200 dark:hover:bg-ink-800/80 dark:hover:text-jade-300"
              >
                <span>Privacy Policy</span>
                <ChevronRight className="h-4 w-4 text-ink-400" aria-hidden="true" />
              </Link>
            </div>
          </section>

          {/* Social & Brand Trust */}
          <div className="border-t border-ink-200 pt-5 dark:border-ink-800">
            <div className="flex items-center gap-2">
              {[
                { href: 'https://x.com/goodsale', label: 'GoodSale on X', Icon: Twitter },
                { href: 'https://instagram.com/goodsale', label: 'GoodSale on Instagram', Icon: Instagram },
                { href: 'https://facebook.com/goodsale', label: 'GoodSale on Facebook', Icon: Facebook },
                { href: 'https://linkedin.com/company/goodsale', label: 'GoodSale on LinkedIn', Icon: Linkedin },
              ].map(({ href, label, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-ink-200 text-ink-500 transition-colors hover:border-jade-500/40 hover:text-jade-600 dark:border-ink-800 dark:text-ink-400 dark:hover:text-jade-400"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </a>
              ))}
            </div>

            <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-jade-500/10 px-3 py-2 text-xs font-semibold text-jade-700 dark:text-jade-300">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              Escrow protected on every order
            </p>

            <p className="mt-4 text-xs text-ink-400">
              © {new Date().getFullYear()} GoodSale · Built in Nigeria · Payments by Paystack
            </p>
          </div>
        </div>
      </aside>
    </div>,
    document.body
  );
}
