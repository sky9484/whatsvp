'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from './supabase/client';
import type { AvatarItem } from './types';

/**
 * The avatar catalog (v4 P3) — world-readable, rarely changes, fetched once
 * and cached for the whole session via react-query (already a dependency)
 * rather than re-fetched by every AvatarComposite instance.
 */
export function useAvatarCatalog() {
  return useQuery({
    queryKey: ['avatar-items'],
    queryFn: async (): Promise<AvatarItem[]> => {
      const supabase = createClient();
      if (!supabase) return [];
      const { data } = await supabase.from('avatar_items').select('*').order('slot');
      return (data ?? []) as AvatarItem[];
    },
    staleTime: Infinity,
  });
}
