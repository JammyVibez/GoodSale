// components/verification/VerificationStatusChip.tsx
'use client';

import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  FileText,
  Info,
  ShieldAlert,
  ShieldX,
  TimerOff,
} from 'lucide-react';
import { STAGE_META, type VerificationStage } from '@/lib/verification';

const TONES: Record<string, { wrap: string; Icon: typeof BadgeCheck }> = {
  neutral: {
    wrap: 'border-ink-200 bg-ink-100 text-ink-600 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300',
    Icon: FileText,
  },
  info: {
    wrap: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    Icon: Clock3,
  },
  gold: {
    wrap: 'border-gold-300/50 bg-gold-50 text-gold-700 dark:bg-gold-300/10 dark:text-gold-200',
    Icon: Info,
  },
  success: {
    wrap: 'border-jade-500/30 bg-jade-500/10 text-jade-700 dark:text-jade-300',
    Icon: CheckCircle2,
  },
  warning: {
    wrap: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    Icon: AlertTriangle,
  },
  danger: {
    wrap: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300',
    Icon: ShieldAlert,
  },
};

const ICONS: Partial<Record<VerificationStage, typeof BadgeCheck>> = {
  VERIFIED: BadgeCheck,
  REJECTED: ShieldX,
  SUSPENDED: ShieldAlert,
  REVOKED: ShieldX,
  EXPIRED: TimerOff,
};

export default function VerificationStatusChip({
  stage,
  size = 'md',
  className = '',
}: {
  stage: VerificationStage;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const meta = STAGE_META[stage] || STAGE_META.UNVERIFIED;
  const tone = TONES[meta.tone] || TONES.neutral;
  const Icon = ICONS[stage] || tone.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${
        size === 'sm' ? 'px-2 py-0.5 text-[10px] uppercase tracking-wide' : 'px-2.5 py-1 text-xs'
      } ${tone.wrap} ${className}`}
    >
      <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
