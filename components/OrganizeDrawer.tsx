'use client';

import { useState, useEffect, useRef } from 'react';
import type { RawEvent } from '@/lib/types';
import { getEventStatus } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

interface OrganizeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onEventAdded: (event: RawEvent & { status: ReturnType<typeof getEventStatus> }) => void;
}

export default function OrganizeDrawer({
  isOpen,
  onClose,
  onEventAdded,
}: OrganizeDrawerProps) {
  const { token } = useAuth();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when drawer opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      // Reset state when closed
      setUrl('');
      setError('');
      setSuccess(false);
      setLoading(false);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/organize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
      } else {
        setSuccess(true);
        onEventAdded({ ...data.event, status: getEventStatus(data.event) });
        setTimeout(onClose, 2500);
      }
    } catch {
      setError('Network error — check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 transition-opacity duration-200
          ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden
        style={{ background: 'rgba(27, 27, 24, 0.35)', backdropFilter: 'blur(2px)' }}
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-label="Organize an event"
        aria-modal="true"
        className={`fixed bottom-0 left-0 right-0 z-50 bg-paper rounded-t-2xl shadow-2xl
                    border-t border-hairline px-5 pt-5 pb-8 transition-transform duration-[280ms]
                    [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]
                    sm:left-auto sm:right-6 sm:bottom-6 sm:w-96 sm:rounded-2xl sm:border sm:shadow-2xl
                    ${isOpen ? 'translate-y-0' : 'translate-y-[110%]'}`}
      >
        {/* Handle (mobile) */}
        <div className="mx-auto mb-4 w-9 h-1 rounded-full bg-hairline sm:hidden" />

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Organize an event</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-full bg-ink/10 flex items-center justify-center
                       text-ink/60 hover:bg-ink/20 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        <p className="mt-1 text-sm text-ink/60">
          Paste your Luma event link — we&apos;ll add it to the map. Physical events only.
        </p>

        {success ? (
          <div className="mt-8 py-6 flex flex-col items-center gap-2 text-center">
            <span className="text-3xl">🎉</span>
            <p className="text-sm font-medium text-teal">Event added to the map!</p>
            <p className="text-xs text-ink/50">The pin will appear in a moment.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <div>
              <label htmlFor="luma-url" className="sr-only">
                Luma event URL
              </label>
              <input
                ref={inputRef}
                id="luma-url"
                type="url"
                placeholder="https://lu.ma/your-event"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(''); }}
                required
                className="w-full px-4 py-3 rounded-xl border border-hairline bg-ink/[0.04]
                           text-ink text-sm placeholder:text-ink/40
                           focus:outline-none focus:ring-2 focus:ring-teal/30"
              />
            </div>

            {error && (
              <p className="text-sm text-live" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="w-full py-3 rounded-xl bg-teal text-white text-sm font-semibold
                         hover:bg-teal/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10"
                      stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Fetching event…
                </span>
              ) : (
                'Add to WhatsVP'
              )}
            </button>
          </form>
        )}

        <p className="mt-4 text-xs text-ink/40 text-center">
          Only events with a physical venue and map pin will appear.
        </p>
      </div>
    </>
  );
}
