'use client';

import { useEffect } from 'react';
import type { Event } from '@/lib/types';
import EventDetailContent from './EventDetailContent';

interface EventPopupProps {
  event: Event;
  onClose: () => void;
  onViewBuilding?: () => void;
  onBuildingImage?: (url: string) => void;
  onOpenEventRoom?: () => void;
}

/**
 * Desktop-only floating event card (`hidden md:block`) — mobile uses EventSheet
 * (a draggable bottom sheet) instead. Both share EventDetailContent for the
 * actual data/logic so registration/transit/share/upload live in exactly one place.
 */
export default function EventPopup({ event, onClose, onViewBuilding, onBuildingImage, onOpenEventRoom }: EventPopupProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="hidden md:block">
      <div className="fixed inset-0 z-20" onClick={onClose} aria-hidden />

      <div
        className="fixed md:absolute bottom-6 left-6 right-auto w-[360px] max-h-[calc(100vh-7rem)] overflow-y-auto
                   rounded-2xl shadow-2xl border border-hairline bg-paper z-30"
        role="dialog"
        aria-modal="true"
        aria-label={event.title}
      >
        <EventDetailContent
          event={event}
          onViewBuilding={onViewBuilding}
          onBuildingImage={onBuildingImage}
          onOpenEventRoom={onOpenEventRoom}
        />

        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/25 backdrop-blur
                     flex items-center justify-center text-white hover:bg-black/40 transition-colors text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
