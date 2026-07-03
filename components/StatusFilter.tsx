'use client';

import type { EventFilter } from '@/lib/types';

interface StatusFilterProps {
  active: EventFilter;
  onChange: (f: EventFilter) => void;
  counts: Record<EventFilter, number>;
}

const SEGMENTS: Array<{ key: EventFilter; label: string; activeClass: string }> = [
  { key: 'past', label: 'Past', activeClass: 'bg-ink/60 text-paper' },
  { key: 'live', label: '● Live', activeClass: 'bg-live text-white' },
  { key: 'upcoming', label: 'Upcoming', activeClass: 'bg-teal text-white' },
];

/** Three-way status filter — Past / Live / Upcoming. */
export default function StatusFilter({ active, onChange, counts }: StatusFilterProps) {
  return (
    <div className="flex items-center gap-1.5" role="tablist" aria-label="Event status">
      {SEGMENTS.map(({ key, label, activeClass }) => {
        const isActive = active === key;
        const count = counts[key];
        return (
          <button
            key={key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(key)}
            className={`flex-1 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap
              ${isActive ? activeClass : 'bg-ink/[0.06] text-ink hover:bg-ink/10'}`}
          >
            {label}
            {count > 0 && (
              <span className={`ml-1.5 text-[11px] ${isActive ? 'opacity-80' : 'text-ink/50'}`}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
