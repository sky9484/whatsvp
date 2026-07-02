'use client';

export type TabKey = 'map' | 'guilds' | 'chat' | 'passport';

interface TabBarProps {
  active: TabKey;
  onMap: () => void;
  onGuilds: () => void;
  onChat: () => void;
  onPassport: () => void;
}

const TABS: Array<{ key: TabKey; label: string; icon: (active: boolean) => React.ReactNode }> = [
  {
    key: 'map',
    label: 'Map',
    icon: (a) => (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
    ),
  },
  {
    key: 'guilds',
    label: 'Guilds',
    icon: (a) => (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m5-2.13a4 4 0 100-8 4 4 0 000 8zm6 1a3 3 0 100-6 3 3 0 000 6zm-12 0a3 3 0 100-6 3 3 0 000 6z" />
      </svg>
    ),
  },
  {
    key: 'chat',
    label: 'Chat',
    icon: (a) => (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    key: 'passport',
    label: 'Passport',
    icon: (a) => (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8}>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <circle cx="12" cy="10" r="2.5" />
        <path strokeLinecap="round" d="M8.5 16.5c.7-1.4 2-2 3.5-2s2.8.6 3.5 2" />
      </svg>
    ),
  },
];

/** Bottom tab bar for mobile (<md). Desktop keeps the header's top nav instead. */
export default function TabBar({ active, onMap, onGuilds, onChat, onPassport }: TabBarProps) {
  const handlers: Record<TabKey, () => void> = {
    map: onMap,
    guilds: onGuilds,
    chat: onChat,
    passport: onPassport,
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-paper/95 backdrop-blur-md border-t border-hairline
                 flex items-stretch justify-around pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            onClick={handlers[tab.key]}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-11 transition-colors"
            aria-current={isActive ? 'page' : undefined}
          >
            <span className={isActive ? 'text-teal' : 'text-ink/50'}>{tab.icon(isActive)}</span>
            <span className={`text-[10px] font-medium ${isActive ? 'text-teal' : 'text-ink/50'}`}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
