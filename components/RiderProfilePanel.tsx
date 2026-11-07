'use client';

import React from 'react';
import {
  AlertCircle, BadgeCheck, Bike, Clock, FileText, MapPin, Phone, ShieldCheck, User,
} from 'lucide-react';
import type { DeliveryPartner } from '@/lib/types';
import { SmartAvatar } from './ui/SmartImage';

function mask(value: string, visible = 4) {
  if (!value) return 'Not provided';
  if (value.length <= visible) return value;
  return `${'•'.repeat(Math.min(6, value.length - visible))}${value.slice(-visible)}`;
}

export default function RiderProfilePanel({ rider }: { rider: DeliveryPartner }) {
  const docs = rider.documents ?? [];
  const approved = rider.status === 'APPROVED';
  const statusLook = approved
    ? 'bg-jade-100 text-jade-700 dark:bg-jade-500/15 dark:text-jade-300'
    : rider.status === 'PENDING'
      ? 'bg-gold-100 text-gold-700 dark:bg-gold-400/15 dark:text-gold-300'
      : 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300';
  const StatusIcon = approved ? BadgeCheck : rider.status === 'PENDING' ? Clock : AlertCircle;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SmartAvatar src={rider.photoUrl || rider.selfieUrl} name={rider.fullName} className="h-12 w-12 shrink-0" />
          <div>
            <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-white">Rider profile</h3>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              Your verification information is only visible to you and GoodSale review staff.
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${statusLook}`}>
          <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" /> {rider.status}
        </span>
      </div>

      {rider.status === 'REJECTED' && (
        <div className="flex items-start gap-2 rounded-xl border border-ink-500/25 bg-ink-500/5 p-3 text-xs text-ink-600 dark:text-ink-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong className="block">Application rejected</strong>
            {rider.rejectionReason || 'Contact support for details, then submit a new application.'}
          </div>
        </div>
      )}
      {rider.status === 'SUSPENDED' && (
        <div className="flex items-start gap-2 rounded-xl border border-gold-500/30 bg-gold-50 p-3 text-xs text-gold-900 dark:bg-gold-400/10 dark:text-gold-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong className="block">Account suspended</strong>
            {rider.suspensionReason || 'Contact GoodSale support to resolve this suspension.'}
          </div>
        </div>
      )}
      {rider.status === 'PENDING' && (
        <div className="flex items-start gap-2 rounded-xl border border-gold-500/30 bg-gold-50 p-3 text-xs text-gold-900 dark:bg-gold-400/10 dark:text-gold-200">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong className="block">Verification pending</strong>
            An administrator is reviewing your identity and vehicle documents.
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-ink-150 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
          <h4 className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400">
            <User className="h-3.5 w-3.5 text-jade-500" /> Personal
          </h4>
          <dl className="space-y-2 text-xs">
            <div><dt className="text-ink-400">Full name</dt><dd className="font-semibold text-ink-800 dark:text-ink-200">{rider.fullName}</dd></div>
            <div><dt className="text-ink-400">Phone</dt><dd className="font-semibold text-ink-800 dark:text-ink-200">{rider.phone || 'Not provided'}</dd></div>
            <div><dt className="text-ink-400">Email</dt><dd className="break-all font-semibold text-ink-800 dark:text-ink-200">{rider.email || 'Not provided'}</dd></div>
            <div><dt className="text-ink-400">Address</dt><dd className="font-semibold text-ink-800 dark:text-ink-200">{rider.address || 'Not provided'}</dd></div>
            <div><dt className="text-ink-400">Operating area</dt><dd className="font-semibold text-ink-800 dark:text-ink-200">{[rider.city, rider.state].filter(Boolean).join(', ') || 'Not set'}</dd></div>
          </dl>
        </div>

        <div className="rounded-2xl border border-ink-150 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
          <h4 className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400">
            <Bike className="h-3.5 w-3.5 text-jade-500" /> Vehicle & emergency
          </h4>
          <dl className="space-y-2 text-xs">
            <div><dt className="text-ink-400">Vehicle</dt><dd className="font-semibold text-ink-800 dark:text-ink-200">{rider.vehicleType} · {[rider.brand, rider.model].filter(Boolean).join(' ')}</dd></div>
            <div><dt className="text-ink-400">Registration</dt><dd className="font-mono font-semibold text-ink-800 dark:text-ink-200">{rider.plateNumber || 'Not applicable'}</dd></div>
            <div><dt className="text-ink-400">Emergency contact</dt><dd className="font-semibold text-ink-800 dark:text-ink-200">{rider.emergencyContactName || 'Not provided'}</dd></div>
            <div><dt className="text-ink-400">Emergency phone</dt><dd className="inline-flex items-center gap-1 font-semibold text-ink-800 dark:text-ink-200"><Phone className="h-3 w-3" /> {rider.emergencyContactPhone || 'Not provided'}</dd></div>
            <div><dt className="text-ink-400">Relationship</dt><dd className="font-semibold text-ink-800 dark:text-ink-200">{rider.emergencyContactRelation || 'Not provided'}</dd></div>
          </dl>
        </div>
      </div>

      <div className="rounded-2xl border border-ink-150 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
        <h4 className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400">
          <ShieldCheck className="h-3.5 w-3.5 text-jade-500" /> Verification documents
        </h4>
        <dl className="grid gap-3 text-xs sm:grid-cols-2">
          <div><dt className="text-ink-400">Government ID (NIN)</dt><dd className="font-mono font-semibold text-ink-800 dark:text-ink-200">{mask(rider.nin)}</dd></div>
          <div><dt className="text-ink-400">Submitted files</dt><dd className="font-semibold text-ink-800 dark:text-ink-200">{docs.length} document{docs.length === 1 ? '' : 's'}</dd></div>
        </dl>
        {docs.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {docs.map((document, index) => (
              <li key={`${document.label}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-ink-50 px-2.5 py-2 text-[11px] dark:bg-ink-950/50">
                <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-ink-700 dark:text-ink-300">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-jade-500" />
                  <span className="truncate">{document.label}</span>
                </span>
                {document.url ? (
                  <a href={document.url} target="_blank" rel="noreferrer" className="shrink-0 font-bold text-jade-700 dark:text-jade-300">
                    Open
                  </a>
                ) : (
                  <span className="shrink-0 text-ink-400">On file</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 flex items-start gap-1.5 text-[10px] text-ink-400">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
          Documents are stored in a private bucket. Only you and authorised admins can read them.
        </p>
      </div>
    </div>
  );
}
