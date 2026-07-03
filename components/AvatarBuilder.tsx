'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { useAvatarCatalog } from '@/lib/useAvatarCatalog';
import { createAuthedClient } from '@/lib/supabase/client';
import AvatarComposite from './AvatarComposite';
import type { AvatarConfig, AvatarSlot } from '@/lib/types';

interface AvatarBuilderProps {
  isOpen: boolean;
  onClose: () => void;
}

const SLOTS: { key: AvatarSlot; label: string }[] = [
  { key: 'skin', label: 'Skin' },
  { key: 'base', label: 'Shape' },
  { key: 'hair', label: 'Hair' },
  { key: 'top', label: 'Top' },
  { key: 'accessory', label: 'Accessory' },
  { key: 'bg', label: 'Background' },
];

/**
 * Free avatar builder (v4 P3) — slot tabs, live preview, shuffle. Offered
 * once after first Passport mint (skippable) and afterwards from Settings.
 * Every equip round-trips through /api/avatars/equip (never a direct client
 * write to avatar_config — see 010_avatars_presence.sql) so premium items
 * get checked server-side even though the UI here just shows a lock icon.
 */
export default function AvatarBuilder({ isOpen, onClose }: AvatarBuilderProps) {
  const { profile, token, updateProfile } = useAuth();
  const { data: catalog = [] } = useAvatarCatalog();
  const [activeSlot, setActiveSlot] = useState<AvatarSlot>('skin');
  const [draft, setDraft] = useState<AvatarConfig>({});
  const [grantedIds, setGrantedIds] = useState<Set<string>>(new Set());
  const [busySlot, setBusySlot] = useState<AvatarSlot | null>(null);
  const [error, setError] = useState('');
  const [shuffling, setShuffling] = useState(false);

  useEffect(() => {
    if (isOpen) setDraft(profile?.avatar_config ?? {});
  }, [isOpen, profile?.avatar_config]);

  useEffect(() => {
    if (!isOpen || !token) return;
    const authed = createAuthedClient(token);
    if (!authed) return;
    authed
      .from('granted_items')
      .select('item_id')
      .then(({ data }) => setGrantedIds(new Set((data ?? []).map((r: { item_id: string }) => r.item_id))));
  }, [isOpen, token]);

  const itemsForSlot = useMemo(() => catalog.filter((i) => i.slot === activeSlot), [catalog, activeSlot]);

  const equip = useCallback(
    async (slot: AvatarSlot, itemId: string) => {
      if (!token) return;
      setError('');
      const prev = draft[slot];
      setDraft((d) => ({ ...d, [slot]: itemId }));
      setBusySlot(slot);
      try {
        const res = await fetch('/api/avatars/equip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ slot, item_id: itemId }),
        });
        const data = await res.json();
        if (!res.ok) {
          setDraft((d) => ({ ...d, [slot]: prev }));
          setError(data.error ?? 'Could not equip that item.');
          return;
        }
        updateProfile({ avatar_config: data.avatar_config });
      } finally {
        setBusySlot(null);
      }
    },
    [token, draft, updateProfile]
  );

  const shuffle = async () => {
    setShuffling(true);
    setError('');
    try {
      for (const s of SLOTS) {
        const free = catalog.filter((i) => i.slot === s.key && !i.premium);
        if (free.length === 0) continue;
        const pick = free[Math.floor(Math.random() * free.length)];
        await equip(s.key, pick.id);
      }
    } finally {
      setShuffling(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Build your avatar"
        className="fixed z-[71] bg-paper shadow-2xl flex flex-col
                   inset-x-0 bottom-0 top-[10vh] rounded-t-[20px]
                   sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
                   sm:w-full sm:max-w-[440px] sm:max-h-[80vh] sm:rounded-[20px]"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
          <h2 className="text-sm font-semibold text-ink">Build your avatar</h2>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full bg-ink/10 flex items-center justify-center text-ink/60 hover:bg-ink/20 text-lg leading-none">
            ×
          </button>
        </div>

        <div className="flex flex-col items-center py-5 border-b border-hairline">
          <AvatarComposite config={draft} size={96} fallbackInitial="?" />
          <button onClick={shuffle} disabled={shuffling} className="mt-3 text-xs font-medium text-teal hover:text-teal/70 disabled:opacity-50">
            {shuffling ? 'Shuffling…' : '🎲 Shuffle'}
          </button>
        </div>

        <div className="flex items-center gap-1 px-3 py-2 border-b border-hairline overflow-x-auto no-scrollbar">
          {SLOTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setActiveSlot(s.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors
                ${activeSlot === s.key ? 'bg-teal text-white' : 'bg-ink/[0.06] text-ink hover:bg-ink/10'}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {error && <p className="px-4 pt-2 text-xs text-danger">{error}</p>}

        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-4 gap-3">
          {itemsForSlot.map((item) => {
            const locked = item.premium && !grantedIds.has(item.id);
            return (
              <button
                key={item.id}
                onClick={() => equip(activeSlot, item.id)}
                disabled={busySlot === activeSlot}
                title={locked ? `${item.name} — unlock by collecting more stamps` : item.name}
                className={`relative aspect-square rounded-xl border-2 flex items-center justify-center p-2 transition-colors disabled:opacity-50
                  ${draft[activeSlot] === item.id ? 'border-teal bg-teal/5' : 'border-hairline hover:border-ink/20'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.svg_path} alt={item.name} className={`w-full h-full ${locked ? 'opacity-30 grayscale' : ''}`} />
                {locked && <span className="absolute top-1 right-1 text-[11px]">🔒</span>}
              </button>
            );
          })}
          {itemsForSlot.length === 0 && <p className="col-span-4 text-sm text-ink/40 text-center py-8">No items in this slot yet.</p>}
        </div>

        <div className="p-3 border-t border-hairline">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 transition-colors">
            Done
          </button>
        </div>
      </div>
    </>
  );
}
