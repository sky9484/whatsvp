'use client';

import type { EventFilter } from '@/lib/types';

interface TimeScrubberProps {
  active: EventFilter;
  onChange: (f: EventFilter) => void;
  counts: Record<EventFilter, number>;
}

const SEGMENTS: Array<{ key: EventFilter; label: string; activeClass: string }> = [
  { key: 'live', label: '● Live now', activeClass: 'bg-live text-white' },
  { key: 'today', label: 'Today', activeClass: 'bg-ink text-paper' },
  { key: 'tomorrow', label: 'Tomorrow', activeClass: 'bg-ink text-paper' },
  { key: 'week', label: 'This week', activeClass: 'bg-teal text-white' },
  { key: 'past10', label: 'Past 10 days', activeClass: 'bg-ink/40 text-paper' },
];

/** Segmented time filter (v3 Map 2.0) — replaces the old All/Live/Upcoming chips. */
export default function TimeScrubber({ active, onChange, counts }: TimeScrubberProps) {
  return (
    <div
      className="flex items-center gap-1.5 overflow-x-auto no-scrollbar"
      role="tablist"
      aria-label="Time range"
    >
      {SEGMENTS.map(({ key, label, activeClass }) => {
        const isActive = active === key;
        const count = counts[key];
        return (
          <button
            key={key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(key)}
            className={`flex-none px-3 py-1 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap
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
    </div>
  );
}
