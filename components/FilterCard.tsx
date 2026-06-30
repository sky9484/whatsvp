'use client';

import { useRef } from 'react';
import type { EventFilter } from '@/lib/types';

interface FilterCardProps {
  filter: EventFilter;
  onFilterChange: (f: EventFilter) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onNearMe: () => void;
  eventCounts: { all: number; live: number; upcoming: number };
}

const CHIPS: Array<{ key: EventFilter; label: string }> = [
  { key: 'all',      label: 'All' },
  { key: 'live',     label: '● Live now' },
  { key: 'upcoming', label: 'Upcoming' },
];

export default function FilterCard({
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  onNearMe,
  eventCounts,
}: FilterCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="absolute top-[72px] left-1/2 -translate-x-1/2 z-30 w-full max-w-md px-3 pointer-events-none">
      <div className="bg-paper/95 backdrop-blur-md rounded-2xl shadow-lg border border-hairline p-3 pointer-events-auto">
        {/* Search bar */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/40"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M21 21l-4.35-4.35M16.5 10.5a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search events, venues…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-ink/[0.06] text-ink text-sm
                       placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-teal/30"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink"
            >
              ×
            </button>
          )}
        </div>

        {/* Filter chips + Near me */}
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {CHIPS.map(({ key, label }) => {
            const count = eventCounts[key];
            const isActive = filter === key;
            const activeClass =
              key === 'live'
                ? 'bg-live text-white'
                : key === 'upcoming'
                ? 'bg-upcoming text-white'
                : 'bg-ink text-paper';

            return (
              <button
                key={key}
                onClick={() => onFilterChange(key)}
                className={`px-3 py-1 rounded-full text-[13px] font-medium transition-colors
                  ${isActive ? activeClass : 'bg-ink/[0.06] text-ink hover:bg-ink/10'}`}
              >
                {label}
                {count > 0 && (
                  <span className={`ml-1.5 text-[11px] ${isActive ? 'opacity-80' : 'text-ink/50'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          <button
            onClick={onNearMe}
            className="ml-auto flex items-center gap-1 px-3 py-1 rounded-full text-[13px]
                       font-medium bg-ink/[0.06] text-ink hover:bg-ink/10 transition-colors"
          >
            <span className="text-[10px]">📍</span>
            Near me
          </button>
        </div>
      </div>
    </div>
  );
}
