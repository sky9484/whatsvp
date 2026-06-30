'use client';

import { useAuth } from '@/lib/auth';

interface HeaderProps {
  onOrganize: () => void;
  onChat: () => void;
  onOpenSettings: () => void;
}

export default function Header({ onOrganize, onChat, onOpenSettings }: HeaderProps) {
  const { isAuthed, address, profile, status, login } = useAuth();

  const initial =
    profile?.display_name?.trim()?.[0]?.toUpperCase() ?? 'B';

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-14 bg-paper/90 backdrop-blur-md border-b border-hairline flex items-center px-4 sm:px-6">
      {/* Wordmark */}
      <div className="flex-none font-semibold text-[17px] text-ink tracking-tight select-none">
        Whats<span className="text-teal">VP</span>
      </div>

      {/* Centre nav */}
      <nav className="flex-1 flex justify-center gap-7 text-sm">
        <button
          className="text-ink/60 hover:text-ink active:scale-95 transition-all"
          onClick={() =>
            window.open('https://github.com/sky9484/whatsvp', '_blank', 'noopener')
          }
        >
          how
        </button>
        <button
          className="text-ink/60 hover:text-ink active:scale-95 transition-all"
          onClick={onOrganize}
        >
          organize
        </button>
        <button
          className="text-ink/60 hover:text-ink active:scale-95 transition-all"
          onClick={onChat}
        >
          chat
        </button>
      </nav>

      {/* Auth */}
      <div className="flex-none">
        {address ? (
          // Logged-in chip — shows a friendly identity, NEVER the wallet address.
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full
                       bg-ink/[0.06] hover:bg-ink/10 transition-colors"
            aria-label="Open settings"
          >
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt=""
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : (
              <span className="w-7 h-7 rounded-full bg-teal text-paper text-xs font-semibold flex items-center justify-center">
                {initial}
              </span>
            )}
            <span className="text-sm text-ink max-w-[120px] truncate">
              {status === 'authing'
                ? 'Signing in…'
                : profile?.display_name ?? 'Settings'}
            </span>
          </button>
        ) : (
          <button
            className="px-3.5 py-1.5 rounded-full bg-teal text-paper text-sm font-medium
                       hover:bg-teal/90 transition-colors disabled:opacity-60"
            onClick={login}
            disabled={status === 'connecting'}
          >
            {status === 'connecting' ? 'Connecting…' : 'Log in'}
          </button>
        )}
      </div>
    </header>
  );
}
