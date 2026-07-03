'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import AvatarBuilder from './AvatarBuilder';

/**
 * Offers the avatar builder once, right after a new profile's first login
 * (v4 P3) — skippable, reachable afterwards from Settings. Deliberately NOT
 * tied to the on-chain Passport mint (PassportMinter.tsx) — that's gated on
 * `isMoveConfigured()` and would never fire in a deployment without the Move
 * package published, but the free layered-avatar system has nothing to do
 * with Move at all and should prompt regardless.
 */
export default function FirstAvatarPrompt() {
  const { address, profile, isAuthed } = useAuth();
  const [show, setShow] = useState(false);
  const checkedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthed || !address || !profile) return;
    if (checkedRef.current === address) return;
    checkedRef.current = address;

    const seenKey = `whatsvp-avatar-prompt-seen:${address}`;
    const hasConfig = Boolean(profile.avatar_config && Object.keys(profile.avatar_config).length > 0);
    if (hasConfig || localStorage.getItem(seenKey)) return;

    localStorage.setItem(seenKey, '1');
    setShow(true);
  }, [isAuthed, address, profile]);

  return <AvatarBuilder isOpen={show} onClose={() => setShow(false)} />;
}
