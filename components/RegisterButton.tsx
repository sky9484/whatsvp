'use client';

import { useState } from 'react';
import type { Event } from '@/lib/types';
import { useRegistration } from '@/lib/useRegistration';
import RegisterModal from './RegisterModal';
import { REGISTER } from '@/lib/copy';

/**
 * Standalone Register trigger for the SSR /e/[slug] share page (v4 P2) —
 * there's no MapContainer/EventDetailContent here, so this owns its own
 * useRegistration instance instead of sharing one with a collapsed button
 * elsewhere (there's only one button on this page).
 */
export default function RegisterButton({ event }: { event: Event }) {
  const [open, setOpen] = useState(false);
  const reg = useRegistration(event);

  const label =
    reg.myStatus === 'confirmed'
      ? REGISTER.going
      : reg.myStatus === 'pending'
      ? REGISTER.requested
      : reg.approvalMode
      ? REGISTER.ctaApproval
      : REGISTER.cta;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full py-2.5 rounded-xl bg-teal text-white text-sm font-semibold text-center hover:bg-teal/90 transition-colors"
      >
        {label}
        {reg.confirmedCount > 0 && <span className="text-white/80"> · {reg.confirmedCount}</span>}
      </button>
      <RegisterModal event={event} isOpen={open} onClose={() => setOpen(false)} reg={reg} />
    </>
  );
}
