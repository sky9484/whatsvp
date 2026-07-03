'use client';

import { useState } from 'react';
import type { Event } from '@/lib/types';
import { formatEventTime, whatsAppShareUrl } from '@/lib/utils';
import { useEventDetail } from '@/lib/useEventDetail';
import { useRegistration } from '@/lib/useRegistration';
import RegisterModal from './RegisterModal';
import AvatarComposite from './AvatarComposite';
import SceneCapture from './SceneCapture';
import { REGISTER, SCENES } from '@/lib/copy';

interface EventDetailContentProps {
  event: Event;
  onViewBuilding?: () => void;
  onBuildingImage?: (url: string) => void;
  /** Opens the event's chat room — threaded down from MapContainer's existing
   * handleChat (v4 P2, RegisterModal's post-registration "Open event room"). */
  onOpenEventRoom?: () => void;
  /** Hide the cover-image hero + title (the mobile sheet renders its own compact header). */
  hideHero?: boolean;
}

/**
 * The actual event-detail content — time/venue, transit, registration,
 * calendar/share, directions, building reveal/upload. Shared by EventPopup
 * (desktop floating card) and EventSheet (mobile bottom sheet) so the
 * data/logic lives once. Registration 2.0 (v4 P2) replaced the old inline
 * RSVP toggle with a trigger that opens RegisterModal.
 */
export default function EventDetailContent({
  event,
  onViewBuilding,
  onBuildingImage,
  onOpenEventRoom,
  hideHero,
}: EventDetailContentProps) {
  const {
    address,
    isLandmark,
    transit,
    shared,
    uploading,
    uploadErr,
    checkedIn,
    checkinBusy,
    checkinError,
    checkinOpen,
    presentNow,
    leavingPresence,
    hereNow,
    leavePresence,
    googleMapsUrl,
    wazeUrl,
    calendarUrl,
    uploadBuilding,
    checkIn,
    share,
  } = useEventDetail(event, onBuildingImage);

  const [showRegister, setShowRegister] = useState(false);
  const [showSceneCapture, setShowSceneCapture] = useState(false);
  const reg = useRegistration(event);

  const registerLabel =
    reg.myStatus === 'confirmed' ? REGISTER.going : reg.myStatus === 'pending' ? REGISTER.requested : reg.approvalMode ? REGISTER.ctaApproval : REGISTER.cta;
  const registerDone = reg.myStatus !== 'none';

  const badge =
    event.status === 'live'
      ? { cls: 'bg-live text-white', text: '● LIVE NOW' }
      : event.status === 'upcoming'
      ? { cls: 'bg-upcoming text-white', text: 'UPCOMING' }
      : { cls: 'bg-ink/20 text-ink', text: 'PAST' };

  const headerTint =
    event.status === 'live' ? '#D85A30' : event.status === 'upcoming' ? '#1D9E75' : '#9CA3AF';

  return (
    <>
      {!hideHero && (
        <>
          {event.cover_url ? (
            <div className="relative h-44 overflow-hidden rounded-t-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={event.cover_url} alt={event.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-black/15" />
              <span
                className={`absolute top-3 left-3 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide ${badge.cls}`}
              >
                {badge.text}
              </span>
              <h2 className="absolute bottom-3 left-4 right-4 text-white text-[19px] font-semibold leading-snug drop-shadow">
                {event.title}
              </h2>
            </div>
          ) : (
            <div
              className="relative h-20 rounded-t-2xl flex items-end p-4"
              style={{ background: `linear-gradient(135deg, ${headerTint}22, ${headerTint}0a)` }}
            >
              <span
                className={`absolute top-3 left-3 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide ${badge.cls}`}
              >
                {badge.text}
              </span>
            </div>
          )}
        </>
      )}

      <div className="p-4">
        {!hideHero && !event.cover_url && (
          <h2 className="text-[18px] font-semibold text-ink leading-snug mb-2">{event.title}</h2>
        )}

        {/* Time + venue */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-ink/70">
            <CalendarIcon />
            <span>{formatEventTime(event)}</span>
          </div>
          {event.venue_name && (
            <div className="flex items-center gap-2 text-sm text-ink/60">
              <PinIcon />
              <span className="truncate">{event.venue_name}</span>
            </div>
          )}
        </div>

        {/* Transit */}
        <div className="mt-3 pt-3 border-t border-hairline">
          {transit === 'loading' ? (
            <div className="h-4 w-44 bg-ink/10 rounded animate-pulse" />
          ) : transit ? (
            <div className="flex items-start gap-2 text-sm">
              <span className="text-base leading-none mt-0.5">🚇</span>
              <div className="text-ink/70 min-w-0">
                <div className="flex items-center flex-wrap gap-x-1">
                  <span className="font-medium text-ink">{transit.station_name}</span>
                  <span className="text-ink/30">·</span>
                  <span className="font-medium" style={{ color: transit.line_color }}>
                    {transit.line_name}
                  </span>
                  {transit.distance_m > 0 && (
                    <>
                      <span className="text-ink/30">·</span>
                      <span className="text-ink/50">{formatDist(transit.distance_m)}</span>
                    </>
                  )}
                </div>
                <div className="text-xs text-ink/50 mt-0.5">
                  {transit.next_departure_minutes !== null ? (
                    <>
                      <span className="text-teal font-medium">
                        {transit.next_departure_minutes === 0
                          ? 'departing now'
                          : `next train ~${transit.next_departure_minutes} min`}
                      </span>
                      {transit.headway_minutes ? <span> · every {transit.headway_minutes} min</span> : null}
                      {!transit.realtime && <span className="text-ink/40"> · scheduled</span>}
                    </>
                  ) : (
                    <span className="text-ink/40">
                      {transit.headway_minutes ? `every ${transit.headway_minutes} min` : 'outside service hours'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink/40">No rail station within 2 km</p>
          )}
        </div>

        {/* Primary actions: Register + share */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setShowRegister(true)}
            className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60
              ${registerDone ? 'bg-teal/15 text-teal border border-teal/30' : 'bg-teal text-white hover:bg-teal/90'}`}
          >
            {registerLabel}
            {reg.confirmedCount > 0 && (
              <span className={registerDone ? 'text-teal/70' : 'text-white/80'}> · {reg.confirmedCount}</span>
            )}
          </button>
          <a
            href={calendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Add to calendar"
            title="Add to Google Calendar"
            className="px-3 flex items-center rounded-xl border border-hairline text-ink hover:bg-ink/5 transition-colors"
          >
            <CalendarPlusIcon />
          </a>
          <button
            onClick={share}
            aria-label="Share"
            className="px-3 rounded-xl border border-hairline text-ink hover:bg-ink/5 transition-colors text-sm font-medium"
          >
            {shared ? 'Copied' : <ShareIcon />}
          </button>
          <a
            href={whatsAppShareUrl(event.title, typeof window !== 'undefined' ? `${window.location.origin}/e/${event.id}` : `/e/${event.id}`)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share on WhatsApp"
            title="Share on WhatsApp"
            className="px-3 flex items-center rounded-xl border border-hairline text-ink hover:bg-ink/5 transition-colors"
          >
            <WhatsAppIcon />
          </a>
        </div>

        {/* Check-in — separate from RSVP: RSVP is intent, this is "I'm here". */}
        {checkinOpen && (
          <div className="mt-2">
            {checkedIn ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-teal/10 text-teal text-sm font-medium">
                  <span aria-hidden>✓</span> Checked in — stamp added to your Passport
                </div>
                <button
                  onClick={() => setShowSceneCapture(true)}
                  className="w-full py-2 rounded-xl border border-hairline text-sm font-medium text-ink hover:bg-ink/5 transition-colors"
                >
                  📸 {SCENES.addCta}
                </button>
              </div>
            ) : (
              <button
                onClick={checkIn}
                disabled={checkinBusy}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-live text-white hover:bg-live/90 disabled:opacity-60 transition-colors"
              >
                {checkinBusy ? 'Checking in…' : '📍 Check in'}
              </button>
            )}
            {checkinError && <p className="mt-1 text-xs text-live text-center">{checkinError}</p>}
          </div>
        )}

        {/* Event presence (v4 P3 Level 1) — auto-on at check-in, the brief's
            one deliberately public-ish signal. Only rendered when someone's
            actually here; never "Be the first!" */}
        {hereNow.count > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <span className="flex -space-x-2 flex-none">
              {hereNow.attendees.slice(0, 5).map((a) => (
                <AvatarComposite key={a.profile_id} config={a.avatar_config} size={24} fallbackInitial={a.display_name[0]} className="ring-2 ring-paper" />
              ))}
            </span>
            <span className="text-xs text-ink/60 min-w-0 truncate flex-1">
              {hereNow.count} here now
            </span>
            {presentNow && (
              <button
                onClick={leavePresence}
                disabled={leavingPresence}
                className="text-xs font-medium text-ink/40 hover:text-ink/70 disabled:opacity-50 flex-none"
              >
                {leavingPresence ? 'Leaving…' : 'Leave'}
              </button>
            )}
          </div>
        )}

        {/* Secondary: directions */}
        <div className="mt-2 flex gap-2">
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2 px-3 text-[13px] font-medium text-center rounded-xl border border-hairline text-ink hover:bg-ink/5 transition-colors"
          >
            Google Maps
          </a>
          <a
            href={wazeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2 px-3 text-[13px] font-medium text-center rounded-xl border border-hairline text-ink hover:bg-ink/5 transition-colors"
          >
            Waze
          </a>
        </div>

        {/* Iso building reveal */}
        {onViewBuilding && (isLandmark || event.building_image_url) && (
          <button
            onClick={onViewBuilding}
            className="mt-2 w-full py-2 text-[13px] font-medium text-teal hover:text-teal/70 transition-colors text-center"
          >
            View building in 3D →
          </button>
        )}

        {/* Community building generator — upload a photo to create the iso design */}
        {!isLandmark && !event.building_image_url && (
          <label
            className={`mt-2 flex flex-col items-center justify-center gap-1 w-full py-3 rounded-xl border border-dashed border-hairline
                        text-center cursor-pointer hover:bg-ink/[0.03] transition-colors ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
          >
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadBuilding(f);
                e.target.value = '';
              }}
            />
            <span className="text-[13px] font-medium text-ink">
              {uploading ? 'Generating isometric design…' : '📷 Add this building'}
            </span>
            <span className="text-[11px] text-ink/45">
              {address
                ? 'Upload a photo → we render its isometric design for the community'
                : 'Log in to add this building for everyone'}
            </span>
          </label>
        )}
        {uploadErr && <p className="mt-1 text-xs text-live text-center">{uploadErr}</p>}
      </div>

      <RegisterModal
        event={event}
        isOpen={showRegister}
        onClose={() => setShowRegister(false)}
        reg={reg}
        onOpenEventRoom={onOpenEventRoom}
      />

      {showSceneCapture && (
        <SceneCapture eventId={event.id} onClose={() => setShowSceneCapture(false)} onCreated={() => setShowSceneCapture(false)} />
      )}
    </>
  );
}

function formatDist(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

function WhatsAppIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.47 14.38c-.29-.15-1.71-.84-1.97-.94-.27-.1-.46-.15-.66.15-.2.29-.76.94-.93 1.13-.17.2-.34.22-.63.07-.29-.15-1.22-.45-2.33-1.44-.86-.77-1.44-1.71-1.61-2-.17-.29-.02-.45.13-.6.13-.13.29-.34.44-.51.15-.17.2-.29.29-.49.1-.2.05-.37-.02-.51-.07-.15-.66-1.59-.9-2.18-.24-.57-.48-.5-.66-.51h-.56c-.2 0-.51.07-.78.37-.27.29-1.02 1-1.02 2.43 0 1.44 1.05 2.83 1.19 3.02.15.2 2.06 3.15 5 4.41.7.3 1.24.48 1.67.62.7.22 1.34.19 1.84.12.56-.08 1.71-.7 1.96-1.37.24-.68.24-1.26.17-1.38-.07-.12-.27-.2-.56-.34z" />
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.77.46 3.45 1.34 4.94L2 22l5.29-1.39a9.9 9.9 0 004.75 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.87 9.87 0 0012.04 2zm0 18.13h-.01a8.21 8.21 0 01-4.19-1.15l-.3-.18-3.14.82.84-3.06-.2-.31a8.24 8.24 0 01-1.26-4.34c0-4.55 3.71-8.26 8.27-8.26 2.21 0 4.28.86 5.84 2.42a8.2 8.2 0 012.42 5.84c0 4.56-3.71 8.26-8.27 8.26z" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg className="w-4 h-4 text-ink/40 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path strokeLinecap="round" d="M3 9h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg className="w-4 h-4 text-ink/40 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
function ShareIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13" />
    </svg>
  );
}
function CalendarPlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path strokeLinecap="round" d="M3 9h18M8 2.5v4M16 2.5v4M12 13v4M10 15h4" />
    </svg>
  );
}
