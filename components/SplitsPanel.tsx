'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAuth } from '@/lib/auth';
import { baseUnitsToUsdc, usdcToBaseUnits } from '@/lib/money';
import AvatarComposite from './AvatarComposite';
import SendMoney from './SendMoney';
import { MONEY } from '@/lib/copy';
import type { AvatarConfig } from '@/lib/types';

interface Share {
  id: string;
  profile_id: string;
  amount_base: string;
  paid_transfer: string | null;
  profiles?: { display_name: string; avatar_url?: string | null; avatar_config?: AvatarConfig | null } | null;
}
interface Split {
  id: string;
  creator_id: string;
  payee_address: string;
  note: string | null;
  total_base: string;
  creator?: { display_name: string; avatar_config?: AvatarConfig | null } | null;
  split_shares: Share[];
}
interface CheckedInMember {
  profile_id: string;
  display_name: string;
  avatar_config?: AvatarConfig | null;
}

interface SplitsPanelProps {
  supabase: SupabaseClient | null;
  eventId: string;
  checkedIn: boolean;
}

/**
 * Splits inside an event room (§5.3 hero flow). Shows the room's split cards
 * (who's paid ✓ / pending), lets a checked-in member start one against the
 * auto-suggested list of other checked-in attendees, and one-tap Pay routes
 * through the shared SendMoney confirm screen. Cards tick live via a Realtime
 * subscription on split_shares.
 */
export default function SplitsPanel({ supabase, eventId, checkedIn }: SplitsPanelProps) {
  const { profile, token: authToken } = useAuth();
  const [splits, setSplits] = useState<Split[]>([]);
  const [creating, setCreating] = useState(false);
  const [members, setMembers] = useState<CheckedInMember[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [payTarget, setPayTarget] = useState<{ share: Share; payee: string } | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('splits')
      .select('*, creator:creator_id(display_name, avatar_config), split_shares(id, profile_id, amount_base, paid_transfer, profiles(display_name, avatar_url, avatar_config))')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });
    setSplits((data ?? []) as Split[]);
  }, [supabase, eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live tick — refetch when any split_share this user can see changes.
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel(`splits:${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'split_shares' }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, eventId, load]);

  const openCreate = async () => {
    setCreating(true);
    if (supabase) {
      const { data } = await supabase
        .from('checkins')
        .select('profile_id, profiles(display_name, avatar_config)')
        .eq('event_id', eventId)
        .is('left_at', null);
      const list: CheckedInMember[] = (data ?? [])
        .map((r) => {
          const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
          return { profile_id: r.profile_id, display_name: p?.display_name ?? 'Someone', avatar_config: p?.avatar_config };
        })
        .filter((m) => m.profile_id !== profile?.id);
      setMembers(list);
      setSelected(new Set(list.map((m) => m.profile_id))); // suggest everyone checked in
    }
  };

  const postSplit = async () => {
    if (!total || selected.size === 0 || !authToken) return;
    setBusy(true);
    try {
      const res = await fetch('/api/splits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ event_id: eventId, total_base: usdcToBaseUnits(total).toString(), note: note || undefined, participant_ids: [...selected] }),
      });
      if (res.ok) {
        setCreating(false);
        setTotal('');
        setNote('');
        void load();
      }
    } finally {
      setBusy(false);
    }
  };

  if (splits.length === 0 && !checkedIn) return null;

  return (
    <div className="border-b border-hairline">
      {splits.map((s) => {
        const paidCount = s.split_shares.filter((sh) => sh.paid_transfer).length;
        const myShare = s.split_shares.find((sh) => sh.profile_id === profile?.id);
        return (
          <div key={s.id} className="px-3 py-2.5 border-b border-hairline last:border-0 bg-ink/[0.02]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">💸 {MONEY.splitTitle}</span>
              <span className="text-xs text-ink/50">{paidCount}/{s.split_shares.length} paid</span>
            </div>
            {s.note && <p className="text-xs text-ink/60 mt-0.5">{s.note}</p>}
            <p className="text-xs text-ink/50 mt-0.5">{baseUnitsToUsdc(s.total_base)} USDC total</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {s.split_shares.map((sh) => (
                <span key={sh.id} className="inline-flex items-center gap-1 pl-0.5 pr-2 py-0.5 rounded-full bg-paper border border-hairline text-[11px]">
                  <AvatarComposite config={sh.profiles?.avatar_config} size={24} fallbackInitial={sh.profiles?.display_name?.[0] ?? '?'} />
                  <span className="text-ink/70">{baseUnitsToUsdc(sh.amount_base)}</span>
                  <span className={sh.paid_transfer ? 'text-teal' : 'text-ink/30'}>{sh.paid_transfer ? '✓' : '·'}</span>
                </span>
              ))}
            </div>
            {myShare && !myShare.paid_transfer && (
              <button
                onClick={() => setPayTarget({ share: myShare, payee: s.payee_address })}
                className="mt-2 w-full py-1.5 rounded-lg bg-teal text-white text-xs font-semibold"
              >
                {MONEY.pay} {baseUnitsToUsdc(myShare.amount_base)} USDC
              </button>
            )}
          </div>
        );
      })}

      {checkedIn && !creating && (
        <button onClick={openCreate} className="w-full py-2 text-xs font-medium text-teal hover:text-teal/70">
          ⊕ {MONEY.split}
        </button>
      )}

      {creating && (
        <div className="p-3 space-y-2">
          <input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="decimal" placeholder={MONEY.splitTotal} className="w-full px-3 py-1.5 rounded-lg border border-hairline bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-teal/30" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What for? (optional)" className="w-full px-3 py-1.5 rounded-lg border border-hairline bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-teal/30" />
          <p className="text-[11px] text-ink/50">{MONEY.splitWith}:</p>
          <div className="flex flex-wrap gap-1.5">
            {members.length === 0 && <span className="text-[11px] text-ink/40">No one else is checked in yet.</span>}
            {members.map((m) => {
              const on = selected.has(m.profile_id);
              return (
                <button
                  key={m.profile_id}
                  onClick={() => setSelected((s) => { const n = new Set(s); if (on) n.delete(m.profile_id); else n.add(m.profile_id); return n; })}
                  className={`inline-flex items-center gap-1 pl-0.5 pr-2 py-0.5 rounded-full text-[11px] border ${on ? 'border-teal bg-teal/10 text-teal' : 'border-hairline text-ink/60'}`}
                >
                  <AvatarComposite config={m.avatar_config} size={24} fallbackInitial={m.display_name[0]} />
                  {m.display_name}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setCreating(false)} className="flex-1 py-1.5 rounded-lg border border-hairline text-xs text-ink hover:bg-ink/5">Cancel</button>
            <button onClick={postSplit} disabled={busy || !total || selected.size === 0} className="flex-1 py-1.5 rounded-lg bg-teal text-white text-xs font-semibold disabled:opacity-50">
              {busy ? 'Posting…' : MONEY.splitPost}
            </button>
          </div>
        </div>
      )}

      {payTarget && (
        <SendMoney
          isOpen
          onClose={() => setPayTarget(null)}
          fixedRecipient={{ display_name: 'the split', address: payTarget.payee }}
          fixedAmount={baseUnitsToUsdc(payTarget.share.amount_base)}
          context={{ kind: 'split', id: payTarget.share.id }}
          onSent={() => {
            setPayTarget(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
