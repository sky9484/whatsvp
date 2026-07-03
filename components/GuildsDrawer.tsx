'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AddFriendButton from './AddFriendButton';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { withStatus, whatsAppShareUrl } from '@/lib/utils';
import type { Guild, GuildMember, Event, RawEvent } from '@/lib/types';

interface GuildsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onShowGuildEvents: (guild: Guild, events: Event[]) => void;
}

interface GuildDetail {
  guild: Guild;
  members: GuildMember[];
  events: RawEvent[];
  groups: { id: string; name: string }[];
}

export default function GuildsDrawer({ isOpen, onClose, onShowGuildEvents }: GuildsDrawerProps) {
  const { token, profile, address, login } = useAuth();
  const toast = useToast();

  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<GuildDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', description: '', color: '#1D9E75' });
  const [busy, setBusy] = useState(false);

  const authHeaders = useCallback(
    () => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }),
    [token]
  );

  // Gate mutations on `token` (what the server requires), not `address` (set
  // synchronously before the session mint completes). Returns false + gives
  // feedback when we can't proceed yet.
  const ensureAuthed = useCallback((): boolean => {
    if (token) return true;
    if (address) toast.show('Finishing sign-in — try again in a moment.');
    else login();
    return false;
  }, [token, address, login, toast]);

  const loadGuilds = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/guilds');
      const data = await res.json();
      setGuilds(data.guilds ?? []);
    } catch {
      /* offline */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) void loadGuilds();
  }, [isOpen, loadGuilds]);

  const openGuild = async (g: Guild) => {
    setDetail(null);
    try {
      const res = await fetch(`/api/guilds/${g.slug}`);
      const data = await res.json();
      if (res.ok) setDetail(data);
      else toast.show(data.error ?? 'Could not open guild', 'error');
    } catch {
      toast.show('Network error', 'error');
    }
  };

  const createGuild = async () => {
    if (!ensureAuthed()) return;
    if (!form.name.trim() || !form.slug.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/guilds', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.show(data.error ?? 'Could not create guild', 'error');
        return;
      }
      toast.show(`Guild “${data.guild.name}” created`, 'success');
      setCreating(false);
      setForm({ name: '', slug: '', description: '', color: '#1D9E75' });
      await loadGuilds();
      void openGuild(data.guild);
    } finally {
      setBusy(false);
    }
  };

  const isMember = detail?.members.some((m) => m.profile_id === profile?.id) ?? false;

  const toggleMembership = async (leave: boolean) => {
    if (!ensureAuthed()) return;
    if (!detail) return;
    setBusy(true);
    try {
      const res = await fetch('/api/guilds/join', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ guild_id: detail.guild.id, leave }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.show(data.error ?? 'Action failed', 'error');
        return;
      }
      toast.show(leave ? 'Left guild' : 'Joined guild', 'success');
      // The server mints the soulbound GuildBadge itself, after recording this
      // membership (see /api/guilds/join) — no client-side mint call here at
      // all, by design (pre-v4 P0 audit fix for guild.move's ungated mint).
      await openGuild(detail.guild);
      await loadGuilds();
    } finally {
      setBusy(false);
    }
  };

  const visible = guilds.filter(
    (g) =>
      !query.trim() ||
      g.name.toLowerCase().includes(query.toLowerCase()) ||
      g.slug.includes(query.toLowerCase())
  );

  return (
    <>
      <div
        className={`fixed inset-0 z-50 transition-opacity duration-200 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden
        style={{ background: 'rgba(27,27,24,0.35)', backdropFilter: 'blur(2px)' }}
      />

      <div
        role="dialog"
        aria-label="Guilds"
        aria-modal="true"
        className={`fixed z-50 bg-paper shadow-2xl border-hairline flex flex-col transition-transform duration-[280ms]
                    [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]
                    bottom-0 left-0 right-0 h-[86vh] rounded-t-2xl border-t
                    sm:top-0 sm:bottom-0 sm:left-auto sm:right-0 sm:h-auto sm:w-[460px] sm:rounded-none sm:border-l sm:border-t-0
                    ${isOpen ? 'translate-y-0 sm:translate-x-0' : 'translate-y-[110%] sm:translate-y-0 sm:translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
          <div className="flex items-center gap-2">
            {detail && (
              <button onClick={() => setDetail(null)} className="text-ink/50 hover:text-ink text-lg leading-none" aria-label="Back">
                ‹
              </button>
            )}
            <h2 className="text-lg font-semibold text-ink">{detail ? detail.guild.name : 'Guilds'}</h2>
            {detail?.guild.is_verified && <span className="text-teal text-sm" title="Verified">✓</span>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-full bg-ink/10 flex items-center justify-center text-ink/60 hover:bg-ink/20 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {!detail ? (
          // ── Directory ──
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search guilds…"
                className="flex-1 px-3.5 py-2 rounded-xl border border-hairline bg-ink/[0.04] text-sm focus:outline-none focus:ring-2 focus:ring-teal/30"
              />
              <button
                onClick={() => (address ? setCreating((v) => !v) : login())}
                className="px-3 rounded-xl bg-teal text-white text-sm font-medium hover:bg-teal/90"
              >
                {creating ? 'Cancel' : '+ New'}
              </button>
            </div>

            {creating && (
              <div className="rounded-xl border border-hairline p-3 space-y-2 bg-ink/[0.02]">
                <input
                  autoFocus
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({
                      ...f,
                      name,
                      slug: f.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
                    }));
                  }}
                  placeholder="Guild name"
                  className="w-full px-3 py-2 rounded-lg border border-hairline bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-teal/30"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink/40">whatsvp.com/g/</span>
                  <input
                    value={form.slug}
                    onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))}
                    placeholder="slug"
                    className="flex-1 px-3 py-2 rounded-lg border border-hairline bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-teal/30"
                  />
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                    className="w-9 h-9 rounded-lg border border-hairline bg-paper cursor-pointer"
                    title="Guild colour"
                  />
                </div>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What's this guild about?"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-hairline bg-paper text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal/30"
                />
                <button
                  onClick={createGuild}
                  disabled={busy || !form.name.trim() || !form.slug.trim()}
                  className="w-full py-2 rounded-lg bg-teal text-white text-sm font-semibold disabled:opacity-50"
                >
                  {busy ? 'Creating…' : 'Create guild'}
                </button>
              </div>
            )}

            {loading ? (
              <p className="text-sm text-ink/40 px-1">Loading guilds…</p>
            ) : visible.length === 0 ? (
              <p className="text-sm text-ink/40 px-1">
                {guilds.length === 0 ? 'No guilds yet — seed the first one.' : 'No matches.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {visible.map((g) => (
                  <li key={g.id}>
                    <button
                      onClick={() => openGuild(g)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-ink/[0.05] transition-colors text-left"
                    >
                      <span
                        className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-base font-bold flex-none"
                        style={{ backgroundColor: g.color ?? '#1D9E75' }}
                      >
                        {g.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={g.logo_url} alt="" className="w-full h-full rounded-xl object-cover" />
                        ) : (
                          g.name[0]?.toUpperCase()
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-ink truncate">{g.name}</span>
                          {g.is_verified && <span className="text-teal text-xs">✓</span>}
                        </span>
                        {g.description && <span className="block text-xs text-ink/50 truncate">{g.description}</span>}
                        <span className="block text-[11px] text-ink/40">{g.member_count ?? 0} members</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          // ── Guild page ──
          <div className="flex-1 overflow-y-auto">
            <div className="h-24 relative" style={{ background: `linear-gradient(135deg, ${detail.guild.color ?? '#1D9E75'}, ${detail.guild.color ?? '#1D9E75'}55)` }}>
              {detail.guild.banner_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={detail.guild.banner_url} alt="" className="w-full h-full object-cover" />
              )}
            </div>
            <div className="px-4 -mt-6">
              <span
                className="w-14 h-14 rounded-2xl border-4 border-paper flex items-center justify-center text-white text-xl font-bold"
                style={{ backgroundColor: detail.guild.color ?? '#1D9E75' }}
              >
                {detail.guild.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={detail.guild.logo_url} alt="" className="w-full h-full rounded-2xl object-cover" />
                ) : (
                  detail.guild.name[0]?.toUpperCase()
                )}
              </span>
              {detail.guild.description && <p className="mt-2 text-sm text-ink/70">{detail.guild.description}</p>}
              <p className="mt-1 text-xs text-ink/45">
                {detail.members.length} members · {detail.events.length}{' '}
                {detail.events.length === 1 ? 'event' : 'events'}
              </p>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => toggleMembership(isMember)}
                  disabled={busy || (!!address && !token)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60
                    ${isMember ? 'bg-ink/[0.06] text-ink border border-hairline' : 'bg-teal text-white hover:bg-teal/90'}`}
                >
                  {address && !token ? 'Signing in…' : isMember ? 'Joined ✓' : 'Join guild'}
                </button>
                {detail.events.length > 0 && (
                  <button
                    onClick={() => {
                      onShowGuildEvents(detail.guild, withStatus(detail.events));
                      onClose();
                    }}
                    className="px-3.5 py-2 rounded-xl text-sm font-medium border border-hairline text-ink hover:bg-ink/5"
                  >
                    Show on map
                  </button>
                )}
                <a
                  href={whatsAppShareUrl(
                    detail.guild.name,
                    typeof window !== 'undefined' ? `${window.location.origin}/g/${detail.guild.slug}` : `/g/${detail.guild.slug}`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Share on WhatsApp"
                  title="Share on WhatsApp"
                  className="px-3 flex items-center rounded-xl border border-hairline text-ink hover:bg-ink/5 transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.47 14.38c-.29-.15-1.71-.84-1.97-.94-.27-.1-.46-.15-.66.15-.2.29-.76.94-.93 1.13-.17.2-.34.22-.63.07-.29-.15-1.22-.45-2.33-1.44-.86-.77-1.44-1.71-1.61-2-.17-.29-.02-.45.13-.6.13-.13.29-.34.44-.51.15-.17.2-.29.29-.49.1-.2.05-.37-.02-.51-.07-.15-.66-1.59-.9-2.18-.24-.57-.48-.5-.66-.51h-.56c-.2 0-.51.07-.78.37-.27.29-1.02 1-1.02 2.43 0 1.44 1.05 2.83 1.19 3.02.15.2 2.06 3.15 5 4.41.7.3 1.24.48 1.67.62.7.22 1.34.19 1.84.12.56-.08 1.71-.7 1.96-1.37.24-.68.24-1.26.17-1.38-.07-.12-.27-.2-.56-.34z" />
                    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.77.46 3.45 1.34 4.94L2 22l5.29-1.39a9.9 9.9 0 004.75 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.87 9.87 0 0012.04 2zm0 18.13h-.01a8.21 8.21 0 01-4.19-1.15l-.3-.18-3.14.82.84-3.06-.2-.31a8.24 8.24 0 01-1.26-4.34c0-4.55 3.71-8.26 8.27-8.26 2.21 0 4.28.86 5.84 2.42a8.2 8.2 0 012.42 5.84c0 4.56-3.71 8.26-8.27 8.26z" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Roster */}
            <div className="px-4 mt-5">
              <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-2">Roster</h3>
              <div className="flex flex-wrap gap-2">
                {detail.members.slice(0, 24).map((m) => (
                  <span key={m.profile_id} className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-ink/[0.05] text-xs">
                    <span className="w-5 h-5 rounded-full bg-teal text-paper flex items-center justify-center text-[10px] font-semibold">
                      {m.profiles?.display_name?.[0]?.toUpperCase() ?? '?'}
                    </span>
                    <span className="text-ink/70 max-w-[90px] truncate">{m.profiles?.display_name ?? 'Member'}</span>
                    {m.role !== 'member' && <span className="text-teal text-[10px]">{m.role}</span>}
                    <AddFriendButton profileId={m.profile_id} />
                  </span>
                ))}
              </div>
            </div>

            {/* Events */}
            {detail.events.length > 0 && (
              <div className="px-4 mt-5 pb-6">
                <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-2">Events</h3>
                <ul className="space-y-1.5">
                  {detail.events.map((e) => (
                    <li key={e.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-ink/[0.03]">
                      <span className="w-1.5 h-8 rounded-full flex-none" style={{ backgroundColor: detail.guild.color ?? '#1D9E75' }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink truncate">{e.title}</span>
                        <span className="block text-xs text-ink/50 truncate">{e.venue_name}</span>
                      </span>
                      {e.host_id === profile?.id && (
                        <Link
                          href={`/guilds/${detail.guild.slug}/events/${e.id}/manage`}
                          onClick={onClose}
                          className="flex-none text-xs font-medium text-teal hover:text-teal/70"
                        >
                          Manage
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
