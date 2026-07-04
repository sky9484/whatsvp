'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { TAGLINE } from '@/lib/copy';
import AvatarComposite from './AvatarComposite';

interface HeaderProps {
  onGuilds: () => void;
  onOrganize: () => void;
  onChat: () => void;
  onOpenSettings: () => void;
}

export default function Header({ onGuilds, onOrganize, onChat, onOpenSettings }: HeaderProps) {
  const { isAuthed, address, profile, status, login } = useAuth();
  const { theme, toggle } = useTheme();

  const initial =
    profile?.display_name?.trim()?.[0]?.toUpperCase() ?? '?';

  return (
    <header className="glass fixed top-0 left-0 right-0 z-40 h-14 flex items-center justify-between px-4 sm:px-6">
      {/* Wordmark + tagline (tagline hidden on mobile to keep the bar slim) */}
      <div className="flex-none flex items-baseline gap-2 select-none">
        <span className="font-bold text-[18px] text-ink tracking-tight">
          Whats<span className="text-grad-brand">VP</span>
        </span>
        <span className="hidden lg:inline text-xs text-sub">{TAGLINE}</span>
      </div>

      {/* Centre nav — desktop only; mobile uses the Dock instead */}
      <nav className="hidden md:flex flex-1 justify-center gap-7 text-sm">
        <Link href="/about" className="text-ink/60 hover:text-ink active:scale-95 transition-all">
          how
        </Link>
        <button
          className="text-ink/60 hover:text-ink active:scale-95 transition-all"
          onClick={onGuilds}
        >
          guilds
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

      {/* Auth + theme */}
      <div className="flex-none flex items-center gap-2">
        <button
          onClick={toggle}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title="Toggle theme"
          className="w-8 h-8 rounded-full bg-ink/[0.06] hover:bg-ink/10 active:scale-90
                     flex items-center justify-center text-ink/70 transition-all"
        >
          {theme === 'dark' ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3v2m0 14v2m9-9h-2M5 12H3m14.66-6.66l-1.41 1.41M7.75 16.25l-1.41 1.41m0-11.32l1.41 1.41m8.5 8.5l1.41 1.41" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
              <circle cx="12" cy="12" r="4" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
        {address ? (
          // Logged-in chip — shows a friendly identity, NEVER the wallet address.
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full
                       bg-ink/[0.06] hover:bg-ink/10 transition-colors"
            aria-label="Open settings"
          >
            <AvatarComposite
              config={profile?.avatar_config}
              externalUrl={profile?.pfp_verified_at && profile?.pfp_image_url ? profile.pfp_image_url : null}
              plainUrl={profile?.avatar_url}
              fallbackInitial={initial}
              size={24}
            />
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
