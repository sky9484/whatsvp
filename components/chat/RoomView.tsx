'use client';

import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile, EventPhoto } from '@/lib/types';
import { useRoom, type RoomRef } from '@/lib/useRoom';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮'];
const GROUP_WINDOW_MS = 3 * 60_000; // consecutive same-sender messages within this window don't repeat the name

interface RoomViewProps {
  room: RoomRef;
  supabase: SupabaseClient | null;
  profile: Profile | null;
  placeholder?: string;
  disabled?: boolean;
  disabledHint?: string;
  headerExtra?: React.ReactNode;
  /** Event rooms only: recent photo drops, shown as a strip above the messages. */
  photos?: EventPhoto[];
  onUploadPhoto?: (file: File) => Promise<void>;
  uploadingPhoto?: boolean;
  /** DM rooms only: sent messages get expires_at = now + 24h. */
  disappearing?: boolean;
  /** Fired after a message is successfully sent (e.g. to fire a best-effort push). */
  onSent?: (body: string) => void;
}

/** Shared message list + composer for all three chat tiers — reactions, reply-to, grouping, presence. */
export default function RoomView({
  room,
  supabase,
  profile,
  placeholder,
  disabled,
  disabledHint,
  headerExtra,
  photos,
  onUploadPhoto,
  uploadingPhoto,
  disappearing,
  onSent,
}: RoomViewProps) {
  const { messages, reactions, online, send, react, markRead, senderName } = useRoom(room, supabase, profile, { disappearing });
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [openReactionsFor, setOpenReactionsFor] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0) void markRead();
  }, [messages.length, markRead]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    const rt = replyTo;
    setReplyTo(null);
    try {
      await send(body, rt);
      onSent?.(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send');
      setDraft(body);
    }
  };

  const replySnippet = (id: string | null | undefined) => {
    if (!id) return null;
    const m = messages.find((x) => x.id === id);
    return m ? `${senderName(m)}: ${m.body.slice(0, 60)}` : null;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {(online.length > 0 || headerExtra) && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-hairline text-[11px] text-sub">
          {headerExtra}
          {online.length > 0 && (
            <span className="flex items-center gap-1 ml-auto">
              <span className="w-1.5 h-1.5 rounded-full bg-live" /> {online.length} online
            </span>
          )}
        </div>
      )}

      {photos && photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-3 py-2 border-b border-hairline no-scrollbar">
          {photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={p.image_url} alt="" className="w-16 h-16 rounded-lg object-cover flex-none border border-hairline" />
          ))}
        </div>
      )}

      {error && <p className="px-4 py-1.5 text-xs text-live bg-live/5">{error}</p>}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-ink/40 mt-8">No messages yet — say hello 👋</p>
        ) : (
          messages.map((m, i) => {
            const mine = m.profile_id === profile?.id;
            const prev = messages[i - 1];
            const grouped = Boolean(
              prev &&
                prev.profile_id === m.profile_id &&
                new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_WINDOW_MS
            );
            const msgReactions = reactions[m.id] ?? [];
            const reactionCounts = msgReactions.reduce<Record<string, number>>((acc, r) => {
              acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
              return acc;
            }, {});
            const snippet = replySnippet(m.reply_to_id);

            return (
              <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'} ${grouped ? 'mt-0.5' : 'mt-2.5'} group`}>
                {!grouped && <span className="text-[11px] text-ink/40 px-1">{senderName(m)}</span>}
                {snippet && (
                  <div className="max-w-[80%] mb-0.5 px-2 py-1 rounded-lg bg-ink/[0.04] text-[11px] text-ink/50 truncate border-l-2 border-hairline">
                    ↩ {snippet}
                  </div>
                )}
                <div className="flex items-end gap-1">
                  {!mine && (
                    <button
                      onClick={() => setOpenReactionsFor(openReactionsFor === m.id ? null : m.id)}
                      className="opacity-0 group-hover:opacity-100 text-xs text-ink/30 hover:text-ink/60 transition-opacity"
                      aria-label="React"
                    >
                      🙂
                    </button>
                  )}
                  <div
                    className={`max-w-[80%] px-3 py-1.5 rounded-2xl text-sm
                      ${mine ? 'bg-teal text-white rounded-br-sm' : 'bg-ink/[0.07] text-ink rounded-bl-sm'}`}
                  >
                    {m.body}
                  </div>
                  <button
                    onClick={() => setReplyTo(m.id)}
                    className="opacity-0 group-hover:opacity-100 text-xs text-ink/30 hover:text-ink/60 transition-opacity"
                    aria-label="Reply"
                  >
                    ↩
                  </button>
                  {mine && (
                    <button
                      onClick={() => setOpenReactionsFor(openReactionsFor === m.id ? null : m.id)}
                      className="opacity-0 group-hover:opacity-100 text-xs text-ink/30 hover:text-ink/60 transition-opacity"
                      aria-label="React"
                    >
                      🙂
                    </button>
                  )}
                </div>
                {openReactionsFor === m.id && (
                  <div className="flex gap-1 mt-1 px-1">
                    {QUICK_REACTIONS.map((e) => (
                      <button
                        key={e}
                        onClick={() => {
                          void react(m.id, e);
                          setOpenReactionsFor(null);
                        }}
                        className="text-base hover:scale-125 transition-transform"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
                {Object.keys(reactionCounts).length > 0 && (
                  <div className="flex gap-1 mt-0.5 px-1">
                    {Object.entries(reactionCounts).map(([emoji, count]) => (
                      <button
                        key={emoji}
                        onClick={() => void react(m.id, emoji)}
                        className="text-[11px] px-1.5 py-0.5 rounded-full bg-ink/[0.06] hover:bg-ink/10"
                      >
                        {emoji} {count}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {replyTo && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-hairline bg-ink/[0.02] text-xs text-ink/60">
          <span className="truncate">Replying to {replySnippet(replyTo)}</span>
          <button onClick={() => setReplyTo(null)} className="text-ink/40 hover:text-ink ml-2" aria-label="Cancel reply">
            ×
          </button>
        </div>
      )}

      <form onSubmit={submit} className="flex items-center gap-2 p-3 border-t border-hairline">
        {onUploadPhoto && (
          <label
            className={`flex-none w-9 h-9 rounded-full border border-hairline flex items-center justify-center cursor-pointer hover:bg-ink/5 transition-colors ${uploadingPhoto ? 'opacity-50 pointer-events-none' : ''}`}
            aria-label="Add a photo"
          >
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUploadPhoto(f);
                e.target.value = '';
              }}
            />
            📷
          </label>
        )}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={disabled ? disabledHint ?? 'This room is read-only' : placeholder ?? 'Message'}
          disabled={disabled}
          className="flex-1 px-3.5 py-2 rounded-full border border-hairline bg-ink/[0.04]
                     text-sm focus:outline-none focus:ring-2 focus:ring-teal/30 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!draft.trim() || disabled}
          className="px-4 py-2 rounded-full bg-teal text-white text-sm font-medium
                     hover:bg-teal/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
