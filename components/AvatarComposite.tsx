'use client';

import { memo } from 'react';
import { useAvatarCatalog } from '@/lib/useAvatarCatalog';
import type { AvatarConfig, AvatarSlot } from '@/lib/types';

// Stacking order — bg behind everything, accessory (glasses/cap/medal/crown)
// always frontmost. Deliberately not the same order as the builder's slot tabs.
const SLOT_ORDER: AvatarSlot[] = ['bg', 'base', 'skin', 'top', 'hair', 'accessory'];

interface AvatarCompositeProps {
  config?: AvatarConfig | null;
  size?: 24 | 32 | 48 | 96;
  fallbackInitial?: string;
  /** A verified external collectible PFP (v2 Upgrade 4) overrides the composite
   * entirely when set — same teal verification ring as everywhere else it renders. */
  externalUrl?: string | null;
  /** A plain image URL (e.g. profiles.avatar_url from OAuth) — used when there's
   * no layered config yet and no verified external PFP. Priority: externalUrl > config > plainUrl > initial. */
  plainUrl?: string | null;
  className?: string;
}

/**
 * Renders a layered avatar from `avatar_config` (v4 P3) — stacked SVG <img>
 * layers resolved against the shared catalog (lib/useAvatarCatalog.ts).
 * Falls back to an initial-letter circle when there's no config yet (new
 * users, or profiles fetched before the catalog loads) — the same fallback
 * shape already used everywhere in this app (Header, Passport, attendee lists).
 */
function AvatarComposite({ config, size = 48, fallbackInitial = '?', externalUrl, plainUrl, className = '' }: AvatarCompositeProps) {
  const { data: catalog } = useAvatarCatalog();

  if (externalUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={externalUrl}
        alt=""
        style={{ width: size, height: size }}
        className={`rounded-full object-cover ring-2 ring-teal flex-none ${className}`}
      />
    );
  }

  const hasConfig = config && Object.keys(config).length > 0;
  if (!hasConfig && plainUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={plainUrl} alt="" style={{ width: size, height: size }} className={`rounded-full object-cover flex-none ${className}`} />
    );
  }

  if (!hasConfig || !catalog) {
    return (
      <span
        style={{ width: size, height: size, fontSize: size * 0.42 }}
        className={`rounded-full bg-teal text-white font-semibold flex items-center justify-center flex-none ${className}`}
      >
        {fallbackInitial}
      </span>
    );
  }

  const byId = new Map(catalog.map((i) => [i.id, i]));

  return (
    <div style={{ width: size, height: size }} className={`relative rounded-full overflow-hidden flex-none ${className}`}>
      {SLOT_ORDER.map((slot) => {
        const itemId = config![slot];
        const item = itemId ? byId.get(itemId) : undefined;
        if (!item) return null;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={slot} src={item.svg_path} alt="" className="absolute inset-0 w-full h-full" />
        );
      })}
    </div>
  );
}

export default memo(AvatarComposite);
