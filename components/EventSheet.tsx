'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, useMotionValue, animate, type PanInfo } from 'framer-motion';
import type { Event } from '@/lib/types';
import { formatEventTime } from '@/lib/utils';
import EventDetailContent from './EventDetailContent';

type SnapPoint = 'peek' | 'half' | 'full';

interface EventSheetProps {
  events: Event[];
  selectedEvent: Event | null;
  onEventSelect: (event: Event) => void;
  onClose: () => void;
  onViewBuilding?: (event: Event) => void;
  onBuildingImage?: (event: Event, url: string) => void;
  onOpenEventRoom?: () => void;
}

const PEEK_PX = 132; // just the carousel strip
const SPRING = { type: 'spring' as const, stiffness: 300, damping: 32 };

/**
 * Mobile-only (md:hidden) draggable bottom sheet: peek (carousel) → half →
 * full. A horizontal card carousel at peek height is scroll-synced two ways —
 * swiping a card flies the map to it; tapping a pin scrolls the carousel to
 * match. Desktop keeps EventPopup (a floating card) instead.
 */
export default function EventSheet({
  events,
  selectedEvent,
  onEventSelect,
  onClose,
  onViewBuilding,
  onBuildingImage,
  onOpenEventRoom,
}: EventSheetProps) {
  const [snap, setSnap] = useState<SnapPoint>('peek');
  const [activeIndex, setActiveIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const suppressScrollSync = useRef(false);

  const heights = useMemo(() => {
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    return { peek: PEEK_PX, half: vh * 0.5, full: vh * 0.88 };
  }, []);

  const yFor = useCallback(
    (point: SnapPoint) => {
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
      return vh - heights[point];
    },
    [heights]
  );

  // `drag` and programmatic snapping must share ONE motion value — mixing
  // `drag` with the `animate` PROP (via useAnimation) silently no-ops the
  // animation (framer-motion has the drag gesture own that axis). The fix is
  // useMotionValue + the imperative `animate()` call, which both drag and
  // controlled snapping can drive.
  const y = useMotionValue(yFor('peek'));

  // Animate to a snap point
  const goTo = useCallback(
    (point: SnapPoint) => {
      setSnap(point);
      animate(y, yFor(point), SPRING);
    },
    [y, yFor]
  );

  // When a pin is tapped externally, scroll the carousel to match + expand.
  useEffect(() => {
    if (!selectedEvent) return;
    const idx = events.findIndex((e) => e.id === selectedEvent.id);
    if (idx === -1) return;
    setActiveIndex(idx);
    suppressScrollSync.current = true;
    carouselRef.current?.scrollTo({ left: idx * CARD_STEP, behavior: 'smooth' });
    goTo('half');
    setTimeout(() => (suppressScrollSync.current = false), 400);
  }, [selectedEvent, events, goTo]);

  // Carousel scroll → active card → fly the map (debounced via rAF-ish timeout)
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCarouselScroll = () => {
    if (suppressScrollSync.current || !carouselRef.current) return;
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const el = carouselRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollLeft / CARD_STEP);
      const clamped = Math.max(0, Math.min(events.length - 1, idx));
      if (clamped !== activeIndex && events[clamped]) {
        setActiveIndex(clamped);
        onEventSelect(events[clamped]);
      }
    }, 120);
  };

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    const currentY = yFor(snap) + info.offset.y;
    const points: Array<[SnapPoint, number]> = [
      ['full', yFor('full')],
      ['half', yFor('half')],
      ['peek', yFor('peek')],
    ];
    // Bias by velocity: a fast downward flick drops a level even if not past halfway.
    let target: SnapPoint = points.reduce((best, p) =>
      Math.abs(p[1] - currentY) < Math.abs(yFor(best) - currentY) ? p[0] : best
    , 'peek' as SnapPoint);

    if (info.velocity.y > 500) target = snap === 'full' ? 'half' : 'peek';
    else if (info.velocity.y < -500) target = snap === 'peek' ? 'half' : 'full';

    goTo(target);
  };

  if (events.length === 0) return null;
  const active = events[activeIndex] ?? events[0];

  return (
    <motion.div
      drag="y"
      dragConstraints={{ top: yFor('full'), bottom: yFor('peek') }}
      dragElastic={0.04}
      onDragEnd={handleDragEnd}
      style={{ height: '92vh', y }}
      className="md:hidden fixed left-0 right-0 top-0 z-30 bg-paper rounded-t-2xl shadow-2xl border-t border-hairline
                 flex flex-col touch-none"
    >
      {/* Drag handle — also tap-to-expand/collapse */}
      <button
        onClick={() => goTo(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek')}
        className="flex-none pt-2.5 pb-2 flex justify-center cursor-grab active:cursor-grabbing touch-none"
        aria-label={snap === 'peek' ? 'Expand' : 'Collapse'}
      >
        <span className="w-9 h-1 rounded-full bg-hairline" />
      </button>

      {/* Peek: horizontal card carousel — always visible */}
      <div
        ref={carouselRef}
        onScroll={handleCarouselScroll}
        className="flex-none flex gap-2.5 overflow-x-auto no-scrollbar px-3 pb-3 snap-x snap-mandatory touch-pan-x"
      >
        {events.map((e, i) => (
          <button
            key={e.id}
            onClick={() => {
              setActiveIndex(i);
              onEventSelect(e);
              goTo(snap === 'peek' ? 'half' : snap);
            }}
            className={`flex-none w-[240px] snap-center text-left rounded-xl border p-2.5 transition-colors
              ${i === activeIndex ? 'border-teal bg-teal/5' : 'border-hairline bg-surface'}`}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full flex-none ${
                  e.status === 'live' ? 'bg-live' : e.status === 'upcoming' ? 'bg-upcoming' : 'bg-ink/30'
                }`}
              />
              <span className="text-[13px] font-semibold text-ink truncate">{e.title}</span>
            </div>
            <p className="mt-0.5 text-[11px] text-sub truncate">{formatEventTime(e)}</p>
            {e.venue_name && <p className="text-[11px] text-sub truncate">{e.venue_name}</p>}
          </button>
        ))}
      </div>

      {/* Half/full: the active event's full detail */}
      {snap !== 'peek' && active && (
        <div className="flex-1 overflow-y-auto border-t border-hairline">
          <EventDetailContent
            event={active}
            onViewBuilding={onViewBuilding ? () => onViewBuilding(active) : undefined}
            onBuildingImage={onBuildingImage ? (url) => onBuildingImage(active, url) : undefined}
            onOpenEventRoom={onOpenEventRoom}
            hideHero
          />
        </div>
      )}

      <button
        onClick={() => {
          onClose();
          goTo('peek');
        }}
        aria-label="Close"
        className="absolute top-2.5 right-3 w-7 h-7 rounded-full bg-ink/10 flex items-center justify-center
                   text-ink/60 hover:bg-ink/20 transition-colors text-lg leading-none"
      >
        ×
      </button>
    </motion.div>
  );
}

const CARD_STEP = 250; // card width (240) + gap (10)
