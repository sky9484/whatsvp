'use client';

import { useRef } from 'react';

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onNearMe: () => void;
}

/** Search box + "near me" — the time-range segments live in TimeScrubber instead. */
export default function SearchBar({ searchQuery, onSearchChange, onNearMe }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
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
  );
}
