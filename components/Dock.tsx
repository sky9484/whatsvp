'use client';

/**
 * The Dock (v4 P1) — mobile bottom nav, replaces TabBar.tsx. Five items:
 * Scenes · Guilds · [map orb] · Chat · Profile. The map orb is the product's
 * heartbeat (per the brief) — a raised circle with a live-count ring, not
 * just another tab icon. Scenes opened ScenesDrawer.tsx once v4 P4 shipped.
 */

const MAX_RING_SEGMENTS = 12;
const RING_R = 30;

export type DockActive = 'guilds' | 'chat' | 'profile' | 'scenes' | null;

interface DockProps {
  active: DockActive;
  liveCount: number;
  hasUnreadChat: boolean;
  onScenes: () => void;
  onGuilds: () => void;
  onMapOrb: () => void;
  onChat: () => void;
  onProfile: () => void;
}

export default function Dock({ active, liveCount, hasUnreadChat, onScenes, onGuilds, onMapOrb, onChat, onProfile }: DockProps) {
  return (
    <nav
      className="md:hidden fixed left-3 right-3 bottom-[calc(env(safe-area-inset-bottom)+10px)] z-40
                 glass-clear rounded-[24px] shadow-lg flex items-stretch justify-around px-1"
      aria-label="Primary"
    >
      <DockItem label="Scenes" active={active === 'scenes'} onClick={onScenes}>
        <SceneIcon />
      </DockItem>
      <DockItem label="Guilds" active={active === 'guilds'} onClick={onGuilds}>
        <GuildIcon active={active === 'guilds'} />
      </DockItem>

      {/* Map orb — the product's heartbeat: a 76px circle raised well above the
          bar so it visibly overflows the container (v4 redesign). A paper ring
          around it separates the orb from the map + the glass bar behind it. */}
      <div className="relative flex-none w-[76px] -mt-8 flex flex-col items-center">
        <button
          onClick={onMapOrb}
          aria-label={active === null ? 'Recenter on me' : 'Back to map'}
          className="relative w-[76px] h-[76px] rounded-full bg-teal text-white shadow-xl ring-[3px] ring-paper
                     flex items-center justify-center active:scale-95 transition-transform"
        >
          <LiveRing count={liveCount} />
          <MapGlyph />
        </button>
        <span className="-mt-0.5 text-[10px] font-medium text-ink/50">Map</span>
      </div>

      <DockItem label="Chat" active={active === 'chat'} onClick={onChat} badge={hasUnreadChat}>
        <ChatIcon active={active === 'chat'} />
      </DockItem>
      <DockItem label="Profile" active={active === 'profile'} onClick={onProfile}>
        <ProfileIcon active={active === 'profile'} />
      </DockItem>
    </nav>
  );
}

function DockItem({
  label,
  active,
  onClick,
  badge,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 min-h-11 transition-colors"
      aria-current={active ? 'page' : undefined}
    >
      <span className={active ? 'text-teal' : 'text-ink/50'}>{children}</span>
      {badge && <span className="absolute top-1.5 right-[calc(50%-15px)] w-2 h-2 rounded-full bg-danger" aria-hidden />}
      <span className={`text-[10px] font-medium ${active ? 'text-teal' : 'text-ink/50'}`}>{label}</span>
    </button>
  );
}

/** Segmented coral arc — one dash per live event (capped visually), pulsing. Zero live = no ring. */
function LiveRing({ count }: { count: number }) {
  if (count <= 0) return null;
  const segments = Math.min(count, MAX_RING_SEGMENTS);
  const c = 2 * Math.PI * RING_R;
  const slot = c / segments;
  const dash = slot * 0.6;
  return (
    <svg className="orb-ring absolute -inset-[3px] pointer-events-none" viewBox="0 0 72 72" aria-hidden>
      <circle
        cx="36"
        cy="36"
        r={RING_R}
        fill="none"
        stroke="rgb(var(--danger))"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${slot - dash}`}
      />
    </svg>
  );
}

function MapGlyph() {
  return (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
      />
    </svg>
  );
}

function GuildIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m5-2.13a4 4 0 100-8 4 4 0 000 8zm6 1a3 3 0 100-6 3 3 0 000 6zm-12 0a3 3 0 100-6 3 3 0 000 6z"
      />
    </svg>
  );
}

function ChatIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <circle cx="12" cy="8" r="3.5" />
      <path strokeLinecap="round" d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5" />
    </svg>
  );
}

/** Camera glyph for Scenes — the check-in-gated moment feature (v4 P4, not yet built). */
function SceneIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8a2 2 0 012-2h1.5l1-1.5h7l1 1.5H18a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </svg>
  );
}
