'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Event, QuestionKind, RegistrationAnswerValue } from '@/lib/types';
import { formatEventTime, whatsAppShareUrl } from '@/lib/utils';
import { buildCalendarUrl } from '@/lib/useEventDetail';
import type { useRegistration } from '@/lib/useRegistration';
import { REGISTER } from '@/lib/copy';

interface RegisterModalProps {
  event: Event;
  isOpen: boolean;
  onClose: () => void;
  /** Owned by the caller (one instance shared with the collapsed trigger
   * button showing "Register"/"Requested"/"You're in ✓") rather than created
   * here — so a successful registration inside the modal is immediately
   * reflected in the trigger without a second, out-of-sync fetch. */
  reg: ReturnType<typeof useRegistration>;
  /** Opens the event's chat room (drawer already exists in the map shell).
   * When omitted (e.g. the standalone /e/[slug] share page), falls back to a
   * plain link back into the interactive map. */
  onOpenEventRoom?: () => void;
}

/**
 * Registration 2.0 (v4 P2) — replaces the old inline RSVP toggle. Two flows:
 * logged-in (Passport identity, zero name/email fields) and guest (name +
 * email captured here, claimed later via the link in lib/mail.ts). All
 * writes go through /api/register (lib/useRegistration.ts) — event_rsvps'
 * client INSERT was revoked once capacity/approval became real invariants.
 */
export default function RegisterModal({ event, isOpen, onClose, reg, onOpenEventRoom }: RegisterModalProps) {
  const [showAttendees, setShowAttendees] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  // Esc to close, scroll-lock, and a lightweight focus trap while open.
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  const badge =
    event.status === 'live'
      ? { cls: 'bg-live text-white', text: '● LIVE NOW' }
      : event.status === 'upcoming'
      ? { cls: 'bg-upcoming text-white', text: 'UPCOMING' }
      : { cls: 'bg-ink/20 text-ink', text: 'PAST' };

  const remaining = reg.capacity !== null ? Math.max(0, reg.capacity - reg.confirmedCount) : null;
  const almostFull = reg.capacity !== null && remaining !== null && remaining / reg.capacity <= 0.1 && remaining > 0;
  const isFull = reg.capacity !== null && remaining === 0 && reg.myStatus === 'none';

  const withinRoomWindow =
    event.status === 'live' || Math.abs(new Date(event.starts_at).getTime() - Date.now()) <= 24 * 3600_000;

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/e/${event.id}` : `/e/${event.id}`;

  const primaryLabel = reg.submitting
    ? REGISTER.busy
    : reg.myStatus === 'confirmed'
    ? REGISTER.going
    : reg.myStatus === 'pending'
    ? REGISTER.requested
    : reg.approvalMode
    ? REGISTER.ctaApproval
    : REGISTER.cta;

  const alreadyDone = reg.myStatus !== 'none';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-[60]"
            style={{ background: 'rgba(20,20,18,.45)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={event.title}
            tabIndex={-1}
            drag={reg.result ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_e, info) => {
              if (info.offset.y > 120 || info.velocity.y > 500) onClose();
            }}
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="fixed z-[61] bg-paper shadow-2xl overflow-y-auto outline-none
                       inset-x-0 bottom-0 top-[8vh] rounded-t-[20px] pb-[env(safe-area-inset-bottom)]
                       sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
                       sm:w-full sm:max-w-[600px] sm:max-h-[85vh] sm:rounded-[20px]"
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/25 backdrop-blur
                         flex items-center justify-center text-white hover:bg-black/40 transition-colors text-lg leading-none"
            >
              ×
            </button>

            {reg.result ? (
              <SuccessView
                event={event}
                result={reg.result}
                reducedMotion={reducedMotion}
                shareUrl={shareUrl}
                withinRoomWindow={withinRoomWindow}
                onOpenEventRoom={onOpenEventRoom}
                onClose={onClose}
              />
            ) : (
              <>
                {/* Cover strip */}
                <div className="relative h-36 overflow-hidden rounded-t-[20px] sm:rounded-t-[20px]">
                  {event.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={event.cover_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-teal/25 to-teal/5" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/15" />
                  <div className="absolute top-3 left-3 flex items-center gap-1.5">
                    {reg.guild && (
                      <span className="inline-flex items-center gap-1.5 bg-black/30 backdrop-blur px-2 py-1 rounded-full text-white text-[11px] font-medium">
                        <span
                          className="w-3.5 h-3.5 rounded-sm flex-none"
                          style={{ backgroundColor: reg.guild.color ?? '#1D9E75' }}
                        />
                        {reg.guild.name}
                      </span>
                    )}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide ${badge.cls}`}>
                      {badge.text}
                    </span>
                  </div>
                </div>

                <div className="p-5">
                  {/* Title + time + venue */}
                  <h2 className="text-[26px] font-bold text-ink leading-tight">{event.title}</h2>
                  <div className="mt-2 flex items-center gap-2 text-sm text-ink/70">
                    <CalendarIcon />
                    <span>{formatEventTime(event)}</span>
                    <a
                      href={buildCalendarUrl(event)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Add to calendar"
                      title="Add to calendar"
                      className="text-teal hover:text-teal/70"
                    >
                      <CalendarPlusIcon />
                    </a>
                  </div>
                  {event.venue_name && (
                    <div className="mt-1 flex items-center gap-2 text-sm text-ink/60">
                      <PinIcon />
                      <span className="truncate">{event.venue_name}</span>
                    </div>
                  )}

                  {/* Capacity bar */}
                  {reg.capacity !== null && (
                    <div className="mt-4">
                      <div className="h-1.5 rounded-full bg-ink/10 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${almostFull || isFull ? 'bg-danger' : 'bg-teal'}`}
                          style={{ width: `${Math.min(100, (reg.confirmedCount / reg.capacity) * 100)}%` }}
                        />
                      </div>
                      <p className={`mt-1 text-xs ${almostFull || isFull ? 'text-danger font-medium' : 'text-ink/50'}`}>
                        {isFull
                          ? REGISTER.capacityFull
                          : `${remaining} of ${reg.capacity} spots left${almostFull ? ` — ${REGISTER.capacityAlmostFull}` : ''}`}
                      </p>
                    </div>
                  )}

                  {/* Social proof — mutuals first, never "be the first" */}
                  {reg.attendees.length > 0 && (
                    <button
                      onClick={() => setShowAttendees((v) => !v)}
                      className="mt-4 flex items-center gap-2 text-left w-full"
                    >
                      <span className="flex -space-x-2 flex-none">
                        {reg.attendees.slice(0, 4).map((a) => (
                          <Avatar key={a.profile_id} name={a.display_name} url={a.avatar_url} />
                        ))}
                      </span>
                      <span className="text-sm text-ink/70 min-w-0 truncate">{socialProofLine(reg.attendees)}</span>
                    </button>
                  )}
                  {showAttendees && reg.attendees.length > 0 && (
                    <ul className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-hairline divide-y divide-hairline">
                      {reg.attendees.map((a) => (
                        <li key={a.profile_id} className="flex items-center gap-2.5 px-3 py-2">
                          <Avatar name={a.display_name} url={a.avatar_url} />
                          <span className="text-sm text-ink truncate">{a.display_name}</span>
                          {a.mutual && <span className="ml-auto text-[10px] text-teal font-medium">mutual</span>}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Organizer questions */}
                  {reg.questions.length > 0 && !alreadyDone && (
                    <div className="mt-5 space-y-4">
                      {reg.questions.map((q) => (
                        <QuestionField key={q.id} kind={q.kind} label={q.label} required={q.required} options={q.options ?? []} value={reg.answers[q.id]} onChange={(v) => reg.setAnswer(q.id, v)} />
                      ))}
                    </div>
                  )}

                  {/* Guest capture — logged-out only, identity comes from the Passport session otherwise */}
                  {!reg.isLoggedIn && !alreadyDone && (
                    <div className="mt-5 space-y-2">
                      <input
                        value={reg.guestName}
                        onChange={(e) => reg.setGuestName(e.target.value)}
                        placeholder={REGISTER.guestNamePlaceholder}
                        className="w-full px-3 py-2 rounded-lg border border-hairline bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-teal/30"
                      />
                      <input
                        type="email"
                        value={reg.guestEmail}
                        onChange={(e) => reg.setGuestEmail(e.target.value)}
                        placeholder={REGISTER.guestEmailPlaceholder}
                        className="w-full px-3 py-2 rounded-lg border border-hairline bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-teal/30"
                      />
                      <p className="text-[11px] text-ink/40">{REGISTER.guestNote}</p>
                    </div>
                  )}

                  {reg.approvalMode && !alreadyDone && (
                    <p className="mt-3 text-xs text-ink/50">{REGISTER.approvalNote}</p>
                  )}

                  {reg.error && <p className="mt-3 text-sm text-danger">{reg.error}</p>}

                  <button
                    onClick={alreadyDone ? undefined : reg.submit}
                    disabled={reg.loading || reg.submitting || alreadyDone || isFull}
                    className={`mt-5 w-full py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60
                      ${alreadyDone ? 'bg-teal/15 text-teal border border-teal/30' : 'bg-teal text-white hover:bg-teal/90'}`}
                  >
                    {isFull ? REGISTER.capacityFull : primaryLabel}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function socialProofLine(attendees: { display_name: string }[]): string {
  const names = attendees.slice(0, 2).map((a) => a.display_name);
  const rest = attendees.length - names.length;
  if (attendees.length === 1) return `${attendees[0].display_name} is going`;
  if (rest <= 0) return `${names.join(', ')} are going`;
  return `${names.join(', ')} + ${rest} others going`;
}

function SuccessView({
  event,
  result,
  reducedMotion,
  shareUrl,
  withinRoomWindow,
  onOpenEventRoom,
  onClose,
}: {
  event: Event;
  result: { status: 'confirmed' | 'pending'; mailSent?: boolean; claimUrl?: string };
  reducedMotion: boolean;
  shareUrl: string;
  withinRoomWindow: boolean;
  onOpenEventRoom?: () => void;
  onClose: () => void;
}) {
  const pending = result.status === 'pending';
  return (
    <div className="p-6 pt-10 text-center">
      <div className="relative mx-auto w-28 h-28">
        {!reducedMotion && <Confetti />}
        {!pending && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/stamp-image/${event.id}`}
            alt=""
            className={`w-28 h-28 rounded-full shadow-lg ${reducedMotion ? '' : 'stamp-rotate-settle'}`}
          />
        )}
        {pending && (
          <div className="w-28 h-28 rounded-full bg-upcoming/10 border-2 border-dashed border-upcoming flex items-center justify-center text-4xl">
            ⏳
          </div>
        )}
      </div>

      <h2 className="mt-5 text-h3 font-bold text-ink">{pending ? REGISTER.successTitlePending : REGISTER.successTitle}</h2>
      <p className="mt-1 text-sm text-ink/60">{pending ? REGISTER.successBodyPending : REGISTER.successBody}</p>

      {result.claimUrl && (
        <div className="mt-4 rounded-xl border border-hairline bg-ink/[0.03] p-3 text-left">
          <p className="text-xs font-medium text-ink/60">{REGISTER.mailFallbackTitle}</p>
          <code className="mt-1 block text-xs text-teal break-all">{result.claimUrl}</code>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2">
        <a
          href={buildCalendarUrl(event)}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-2.5 rounded-xl border border-hairline text-sm font-medium text-ink hover:bg-ink/5 transition-colors"
        >
          {REGISTER.addToCalendar}
        </a>
        <a
          href={whatsAppShareUrl(event.title, shareUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-2.5 rounded-xl border border-hairline text-sm font-medium text-ink hover:bg-ink/5 transition-colors"
        >
          {REGISTER.shareWhatsApp}
        </a>
        {withinRoomWindow &&
          (onOpenEventRoom ? (
            <button
              onClick={() => {
                onOpenEventRoom();
                onClose();
              }}
              className="w-full py-2.5 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 transition-colors"
            >
              {REGISTER.openEventRoom}
            </button>
          ) : (
            <a
              href={`/?event=${event.id}&open=chat`}
              className="w-full py-2.5 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 transition-colors text-center"
            >
              {REGISTER.openEventRoom}
            </a>
          ))}
      </div>
    </div>
  );
}

function Confetti() {
  const pieces = Array.from({ length: 14 }, (_, i) => i);
  const colors = ['#0F6E56', '#D85A30', '#1D9E75', '#E0A84A'];
  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible" aria-hidden>
      {pieces.map((i) => {
        const angle = (i / pieces.length) * 360;
        const distance = 30 + Math.random() * 20;
        const x = Math.cos((angle * Math.PI) / 180) * distance;
        const spin = 140 + Math.random() * 200;
        return (
          <span
            key={i}
            className="confetti-piece absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-sm"
            style={{
              backgroundColor: colors[i % colors.length],
              transform: `translate(${x}px, 0)`,
              animationDelay: `${Math.random() * 0.15}s`,
              ['--confetti-spin' as string]: `${spin}deg`,
            }}
          />
        );
      })}
    </div>
  );
}

function Avatar({ name, url }: { name: string; url?: string | null }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="w-7 h-7 rounded-full object-cover ring-2 ring-paper" />
  ) : (
    <span className="w-7 h-7 rounded-full bg-teal text-white text-xs font-semibold flex items-center justify-center ring-2 ring-paper">
      {name[0]?.toUpperCase() ?? '?'}
    </span>
  );
}

function QuestionField({
  kind,
  label,
  required,
  options,
  value,
  onChange,
}: {
  kind: QuestionKind;
  label: string;
  required: boolean;
  options: string[];
  value: RegistrationAnswerValue | undefined;
  onChange: (v: RegistrationAnswerValue) => void;
}) {
  const labelEl = (
    <label className="block text-sm font-medium text-ink mb-1.5">
      {label}
      {required && <span className="text-danger"> *</span>}
    </label>
  );

  if (kind === 'short_text') {
    return (
      <div>
        {labelEl}
        <input
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-hairline bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-teal/30"
        />
      </div>
    );
  }
  if (kind === 'long_text') {
    return (
      <div>
        {labelEl}
        <textarea
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-hairline bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-teal/30 resize-none"
        />
      </div>
    );
  }
  if (kind === 'checkbox') {
    return (
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-sm text-ink">
          {label}
          {required && <span className="text-danger"> *</span>}
        </span>
      </label>
    );
  }
  if (kind === 'single_select') {
    return (
      <div>
        {labelEl}
        <div className="flex flex-wrap gap-1.5">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors
                ${value === opt ? 'bg-teal text-white border-teal' : 'border-hairline text-ink hover:bg-ink/5'}`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }
  // multi_select
  const selected = Array.isArray(value) ? value : [];
  return (
    <div>
      {labelEl}
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isOn = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(isOn ? selected.filter((o) => o !== opt) : [...selected, opt])}
              className={`px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors
                ${isOn ? 'bg-teal text-white border-teal' : 'border-hairline text-ink hover:bg-ink/5'}`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
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
function CalendarPlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path strokeLinecap="round" d="M3 9h18M8 2.5v4M16 2.5v4M12 13v4M10 15h4" />
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
