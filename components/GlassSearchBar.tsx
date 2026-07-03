'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { EventFilter } from '@/lib/types';

/**
 * The glass search bar (v4 P1) — replaces SearchBar.tsx + StatusFilter.tsx as
 * two separate cards. Search + near-me + the 3-way status filter live in one
 * floating glass panel; it collapses to a pill on map pan (scroll-aware) and
 * expands on tap, per the brief. Positions itself (mirrors the old wrapper
 * div MapContainer used to own) so callers just render it.
 */

interface GlassSearchBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onNearMe: () => void;
  filter: EventFilter;
  onFilterChange: (f: EventFilter) => void;
  counts: Record<EventFilter, number>;
  /** Bump this (e.g. on every map 'dragstart') to collapse the bar. */
  collapseSignal: number;
}

const SEGMENTS: Array<{ key: EventFilter; label: string; pillLabel: string; activeClass: string }> = [
  { key: 'past', label: 'Past', pillLabel: 'Past', activeClass: 'bg-ink/60 text-paper' },
  { key: 'live', label: '● Live', pillLabel: 'Live', activeClass: 'bg-danger text-white' },
  { key: 'upcoming', label: 'Upcoming', pillLabel: 'Upcoming', activeClass: 'bg-teal text-white' },
];

export default function GlassSearchBar({
  searchQuery,
  onSearchChange,
  onNearMe,
  filter,
  onFilterChange,
  counts,
  collapseSignal,
}: GlassSearchBarProps) {
  const [expanded, setExpanded] = useState(true);
  const lastSignal = useRef(collapseSignal);

  useEffect(() => {
    if (collapseSignal !== lastSignal.current) {
      lastSignal.current = collapseSignal;
      setExpanded(false);
    }
  }, [collapseSignal]);

  // Never hide an in-progress search behind a collapsed pill.
  useEffect(() => {
    if (searchQuery) setExpanded(true);
  }, [searchQuery]);

  const active = SEGMENTS.find((s) => s.key === filter) ?? SEGMENTS[2];

  return (
    <motion.div
      layout
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      className="absolute bottom-[144px] md:bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-auto"
      style={{ width: expanded ? undefined : 'auto' }}
    >
      {expanded ? (
        <div className="glass rounded-2xl shadow-lg p-3 space-y-2 w-[min(92vw,28rem)]">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/40"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M16.5 10.5a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search events, venues…"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-16 py-2 rounded-xl bg-ink/[0.06] text-ink text-sm
                         placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-teal/30"
            />
            <button
              onClick={onNearMe}
              aria-label="Near me"
              title="Near me"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2.5 py-1
                         rounded-lg text-[12px] font-medium bg-paper text-ink/70 hover:text-ink
                         border border-hairline transition-colors"
            >
              📍
            </button>
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
                className="absolute right-[74px] top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink"
              >
                ×
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5" role="tablist" aria-label="Event status">
            {SEGMENTS.map((s) => {
              const isActive = filter === s.key;
              const count = counts[s.key];
              return (
                <button
                  key={s.key}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onFilterChange(s.key)}
                  className={`flex-1 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap
                    ${isActive ? s.activeClass : 'bg-ink/[0.06] text-ink hover:bg-ink/10'}`}
                >
                  {s.label}
                  {count > 0 && <span className={`ml-1.5 text-[11px] ${isActive ? 'opacity-80' : 'text-ink/50'}`}>{count}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          className="glass rounded-full shadow-lg pl-3 pr-4 py-2 flex items-center gap-2 whitespace-nowrap"
          aria-label="Expand search"
        >
          <svg className="w-4 h-4 text-ink/50 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M16.5 10.5a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <span className="text-[13px] font-medium text-ink">{active.pillLabel}</span>
          {counts[filter] > 0 && <span className="text-[11px] text-ink/50">{counts[filter]}</span>}
        </button>
      )}
    </motion.div>
  );
}
