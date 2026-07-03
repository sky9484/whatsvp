'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { formatEventTime } from '@/lib/utils';
import { createAuthedClient } from '@/lib/supabase/client';
import CheckinQR from '@/components/CheckinQR';
import AddFriendButton from '@/components/AddFriendButton';
import type { RawEvent, RegistrationQuestion, QuestionKind } from '@/lib/types';

/** A check-in — always tied to a real profile (checking in requires a session). */
interface CheckinRow {
  profile_id: string;
  method: 'geofence' | 'qr';
  created_at: string;
  stamp_minted_at?: string | null;
  profiles?: { display_name: string; avatar_url?: string | null } | null;
}

/** A confirmed registration — a guest row has profile_id null and guests set instead. */
interface AttendeeRow {
  profile_id: string | null;
  created_at: string;
  profiles?: { display_name: string; avatar_url?: string | null } | null;
  guests?: { display_name: string | null; email: string } | null;
}

interface PendingRow {
  id: string;
  profile_id: string | null;
  guest_id: string | null;
  created_at: string;
  profiles?: { display_name: string; avatar_url?: string | null } | null;
  guests?: { display_name: string | null; email: string } | null;
}

interface ManageData {
  event: RawEvent;
  rsvp_count: number;
  checkin_count: number;
  rsvps: AttendeeRow[];
  checkins: CheckinRow[];
  questions: RegistrationQuestion[];
  pending: PendingRow[];
}

const QUESTION_KINDS: { key: QuestionKind; label: string }[] = [
  { key: 'short_text', label: 'Short text' },
  { key: 'long_text', label: 'Long text' },
  { key: 'single_select', label: 'Single choice' },
  { key: 'multi_select', label: 'Multiple choice' },
  { key: 'checkbox', label: 'Checkbox' },
];

export default function ManageEventPage() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const { token, address, login } = useAuth();
  const [data, setData] = useState<ManageData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState<'analytics' | 'registration'>('analytics');
  const authed = useMemo(() => createAuthedClient(token), [token]);

  // Registration settings + question builder state
  const [capacityInput, setCapacityInput] = useState('');
  const [approvalInput, setApprovalInput] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [newQuestion, setNewQuestion] = useState({ kind: 'short_text' as QuestionKind, label: '', options: '', required: false });
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    fetch(`/api/guilds/${slug}/events/${id}/manage`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) {
          setError(d.error ?? 'Could not load analytics');
          return;
        }
        setData(d);
        setCapacityInput(d.event.capacity != null ? String(d.event.capacity) : '');
        setApprovalInput(Boolean(d.event.approval_mode));
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, [slug, id, token]);

  useEffect(() => {
    if (token) load();
    else setLoading(false);
  }, [token, load]);

  const saveSettings = async () => {
    if (!token) return;
    setSavingSettings(true);
    try {
      const capacity = capacityInput.trim() === '' ? null : Math.max(0, parseInt(capacityInput, 10) || 0);
      const res = await fetch(`/api/guilds/${slug}/events/${id}/manage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ capacity, approval_mode: approvalInput }),
      });
      if (res.ok) load();
    } finally {
      setSavingSettings(false);
    }
  };

  const addQuestion = async () => {
    if (!authed || !newQuestion.label.trim()) return;
    setAddingQuestion(true);
    try {
      const isSelect = newQuestion.kind === 'single_select' || newQuestion.kind === 'multi_select';
      const options = isSelect
        ? newQuestion.options.split(',').map((o) => o.trim()).filter(Boolean)
        : null;
      const idx = data?.questions.length ?? 0;
      const { error: err } = await authed.from('registration_questions').insert({
        event_id: id,
        idx,
        kind: newQuestion.kind,
        label: newQuestion.label.trim(),
        options,
        required: newQuestion.required,
      });
      if (!err) {
        setNewQuestion({ kind: 'short_text', label: '', options: '', required: false });
        load();
      }
    } finally {
      setAddingQuestion(false);
    }
  };

  const deleteQuestion = async (questionId: string) => {
    if (!authed) return;
    await authed.from('registration_questions').delete().eq('id', questionId);
    load();
  };

  const moveQuestion = async (question: RegistrationQuestion, direction: -1 | 1) => {
    if (!authed || !data) return;
    const sorted = [...data.questions].sort((a, b) => a.idx - b.idx);
    const pos = sorted.findIndex((q) => q.id === question.id);
    const swapWith = sorted[pos + direction];
    if (!swapWith) return;
    await Promise.all([
      authed.from('registration_questions').update({ idx: swapWith.idx }).eq('id', question.id),
      authed.from('registration_questions').update({ idx: question.idx }).eq('id', swapWith.id),
    ]);
    load();
  };

  const approve = async (rsvpId: string, decision: 'confirmed' | 'declined') => {
    if (!token) return;
    setApprovingId(rsvpId);
    try {
      const res = await fetch('/api/register/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rsvp_id: rsvpId, decision }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Could not update that request');
        return;
      }
      load();
    } finally {
      setApprovingId(null);
    }
  };

  const exportCsv = async () => {
    if (!token) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/guilds/${slug}/events/${id}/manage?format=csv`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}-attendees.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-10 h-14 bg-paper/90 backdrop-blur-md border-b border-hairline flex items-center px-4 gap-3">
        <Link href="/" className="text-ink/60 hover:text-ink text-lg leading-none" aria-label="Back to map">
          ‹
        </Link>
        <h1 className="text-[17px] font-semibold text-ink truncate">{data?.event.title ?? 'Manage event'}</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-16">
        {!address ? (
          <div className="text-center py-16">
            <p className="text-ink/60 mb-4">Log in to manage this event.</p>
            <button onClick={login} className="px-4 py-2 rounded-full bg-teal text-white text-sm font-medium hover:bg-teal/90">
              Log in
            </button>
          </div>
        ) : loading ? (
          <p className="text-sm text-ink/40 text-center py-16">Loading…</p>
        ) : error ? (
          <p className="text-sm text-live text-center py-16">{error}</p>
        ) : data ? (
          <div className="space-y-6">
            <p className="text-sm text-sub">{formatEventTime(data.event)}</p>

            <div className="glass inline-flex items-center gap-1 rounded-full p-0.5">
              {(['analytics', 'registration'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize ${
                    tab === t ? 'bg-teal text-white' : 'text-ink/60 hover:text-ink'
                  }`}
                >
                  {t}
                  {t === 'registration' && data.pending.length > 0 && (
                    <span className="ml-1.5 text-[10px] bg-danger text-white rounded-full px-1.5 py-0.5">{data.pending.length}</span>
                  )}
                </button>
              ))}
            </div>

            {tab === 'analytics' ? (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-hairline p-4 text-center">
                    <p className="text-2xl font-semibold text-ink">{data.rsvp_count}</p>
                    <p className="text-xs text-sub mt-0.5">Confirmed</p>
                  </div>
                  <div className="rounded-xl border border-hairline p-4 text-center">
                    <p className="text-2xl font-semibold text-teal">{data.checkin_count}</p>
                    <p className="text-xs text-sub mt-0.5">
                      Checked in
                      {data.rsvp_count > 0 && (
                        <span className="text-sub/70"> · {Math.round((data.checkin_count / data.rsvp_count) * 100)}%</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Timeline sparkline */}
                {data.checkins.length > 0 && (
                  <div>
                    <h2 className="text-xs font-semibold text-sub uppercase tracking-wide mb-2">Check-ins over time</h2>
                    <div className="rounded-xl border border-hairline p-3">
                      <Sparkline checkins={data.checkins} event={data.event} />
                    </div>
                  </div>
                )}

                {/* Check-in code */}
                <div className="rounded-xl border border-hairline p-4">
                  <CheckinQR eventId={id} />
                </div>

                {/* Attendee list */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xs font-semibold text-sub uppercase tracking-wide">Attendees</h2>
                    <button
                      onClick={exportCsv}
                      disabled={exporting || data.rsvps.length === 0}
                      className="text-xs font-medium text-teal hover:text-teal/70 disabled:opacity-40 transition-colors"
                    >
                      {exporting ? 'Exporting…' : 'Export CSV'}
                    </button>
                  </div>
                  {data.rsvps.length === 0 ? (
                    <p className="text-sm text-ink/40 py-6 text-center rounded-xl border border-dashed border-hairline">
                      No registrations yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-hairline rounded-xl border border-hairline overflow-hidden">
                      {data.rsvps.map((c) => {
                        const name = c.profiles?.display_name ?? c.guests?.display_name ?? 'Someone';
                        const checkedIn = data.checkins.some((k) => k.profile_id === c.profile_id);
                        return (
                          <li key={c.profile_id ?? c.guests?.email} className="flex items-center gap-3 px-3.5 py-2.5">
                            <span className="w-7 h-7 rounded-full bg-teal text-paper text-xs font-semibold flex items-center justify-center flex-none">
                              {name[0]?.toUpperCase() ?? '?'}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm text-ink truncate">
                                {name} {!c.profile_id && <span className="text-ink/40 font-normal">(guest)</span>}
                              </span>
                              <span className="block text-[11px] text-sub">{checkedIn ? '✓ Checked in' : 'Registered, not checked in'}</span>
                            </span>
                            {c.profile_id && <AddFriendButton profileId={c.profile_id} />}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Registration settings — capacity + approval mode */}
                <div className="rounded-xl border border-hairline p-4 space-y-3">
                  <h2 className="text-xs font-semibold text-sub uppercase tracking-wide">Settings</h2>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-ink flex-1">Capacity</label>
                    <input
                      type="number"
                      min={0}
                      value={capacityInput}
                      onChange={(e) => setCapacityInput(e.target.value)}
                      placeholder="Uncapped"
                      className="w-28 px-2.5 py-1.5 rounded-lg border border-hairline bg-paper text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal/30"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={approvalInput} onChange={(e) => setApprovalInput(e.target.checked)} />
                    <span className="text-sm text-ink">The host approves registrations</span>
                  </label>
                  <button
                    onClick={saveSettings}
                    disabled={savingSettings}
                    className="w-full py-2 rounded-lg bg-teal text-white text-sm font-semibold disabled:opacity-60"
                  >
                    {savingSettings ? 'Saving…' : 'Save'}
                  </button>
                </div>

                {/* Pending approvals */}
                {data.pending.length > 0 && (
                  <div>
                    <h2 className="text-xs font-semibold text-sub uppercase tracking-wide mb-2">Pending approval</h2>
                    <ul className="divide-y divide-hairline rounded-xl border border-hairline overflow-hidden">
                      {data.pending.map((p) => {
                        const name = p.profiles?.display_name ?? p.guests?.display_name ?? p.guests?.email ?? 'Someone';
                        return (
                          <li key={p.id} className="flex items-center gap-3 px-3.5 py-2.5">
                            <span className="min-w-0 flex-1 text-sm text-ink truncate">{name}</span>
                            <button
                              onClick={() => approve(p.id, 'declined')}
                              disabled={approvingId === p.id}
                              className="px-2.5 py-1 rounded-full text-xs font-medium text-ink/60 hover:bg-ink/5 disabled:opacity-40"
                            >
                              Decline
                            </button>
                            <button
                              onClick={() => approve(p.id, 'confirmed')}
                              disabled={approvingId === p.id}
                              className="px-2.5 py-1 rounded-full text-xs font-medium bg-teal text-white hover:bg-teal/90 disabled:opacity-40"
                            >
                              Approve
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* Question builder */}
                <div>
                  <h2 className="text-xs font-semibold text-sub uppercase tracking-wide mb-2">Registration questions</h2>
                  {data.questions.length > 0 && (
                    <ul className="divide-y divide-hairline rounded-xl border border-hairline overflow-hidden mb-3">
                      {[...data.questions]
                        .sort((a, b) => a.idx - b.idx)
                        .map((q, i, arr) => (
                          <li key={q.id} className="flex items-center gap-2 px-3.5 py-2.5">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-ink truncate">
                                {q.label} {q.required && <span className="text-danger">*</span>}
                              </p>
                              <p className="text-[11px] text-sub">{QUESTION_KINDS.find((k) => k.key === q.kind)?.label}</p>
                            </div>
                            <button onClick={() => moveQuestion(q, -1)} disabled={i === 0} className="text-ink/40 hover:text-ink disabled:opacity-20 px-1">
                              ↑
                            </button>
                            <button onClick={() => moveQuestion(q, 1)} disabled={i === arr.length - 1} className="text-ink/40 hover:text-ink disabled:opacity-20 px-1">
                              ↓
                            </button>
                            <button onClick={() => deleteQuestion(q.id)} className="text-danger/70 hover:text-danger px-1">
                              ×
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}

                  <div className="rounded-xl border border-dashed border-hairline p-3 space-y-2">
                    <input
                      value={newQuestion.label}
                      onChange={(e) => setNewQuestion((q) => ({ ...q, label: e.target.value }))}
                      placeholder="Question label"
                      className="w-full px-3 py-2 rounded-lg border border-hairline bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-teal/30"
                    />
                    <select
                      value={newQuestion.kind}
                      onChange={(e) => setNewQuestion((q) => ({ ...q, kind: e.target.value as QuestionKind }))}
                      className="w-full px-3 py-2 rounded-lg border border-hairline bg-paper text-sm"
                    >
                      {QUESTION_KINDS.map((k) => (
                        <option key={k.key} value={k.key}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                    {(newQuestion.kind === 'single_select' || newQuestion.kind === 'multi_select') && (
                      <input
                        value={newQuestion.options}
                        onChange={(e) => setNewQuestion((q) => ({ ...q, options: e.target.value }))}
                        placeholder="Options, comma separated"
                        className="w-full px-3 py-2 rounded-lg border border-hairline bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-teal/30"
                      />
                    )}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newQuestion.required}
                        onChange={(e) => setNewQuestion((q) => ({ ...q, required: e.target.checked }))}
                      />
                      <span className="text-sm text-ink">Required</span>
                    </label>
                    <button
                      onClick={addQuestion}
                      disabled={addingQuestion || !newQuestion.label.trim()}
                      className="w-full py-2 rounded-lg bg-teal text-white text-sm font-semibold disabled:opacity-60"
                    >
                      {addingQuestion ? 'Adding…' : '+ Add question'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}

function Sparkline({ checkins, event }: { checkins: CheckinRow[]; event: RawEvent }) {
  const BUCKETS = 20;
  const start = new Date(event.starts_at).getTime() - 30 * 60_000;
  const end = (event.ends_at ? new Date(event.ends_at).getTime() : new Date(event.starts_at).getTime() + 3 * 3600_000) + 30 * 60_000;
  const span = Math.max(1, end - start);

  const counts = new Array(BUCKETS).fill(0);
  for (const c of checkins) {
    const t = new Date(c.created_at).getTime();
    const idx = Math.min(BUCKETS - 1, Math.max(0, Math.floor(((t - start) / span) * BUCKETS)));
    counts[idx]++;
  }
  const max = Math.max(1, ...counts);
  const w = 300;
  const h = 56;
  const bw = w / BUCKETS;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14" preserveAspectRatio="none">
      {counts.map((c, i) => {
        const bh = (c / max) * (h - 4);
        return <rect key={i} x={i * bw + 1} y={h - bh} width={Math.max(1, bw - 2)} height={bh} rx={1} fill="#0F6E56" />;
      })}
    </svg>
  );
}
