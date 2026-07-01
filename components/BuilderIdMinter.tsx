'use client';

import { useEffect, useRef } from 'react';
import { useCurrentAccount, useSuiClient, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { useAuth } from '@/lib/auth';
import { isMoveConfigured, buildMintBuilderIdTx, BUILDER_ID_TYPE } from '@/lib/sui-move';

/**
 * Mints the free, soulbound Builder ID to the user right after they log in —
 * gaslessly, sponsored by the Enoki wallet. Renders nothing; pure side-effect.
 *
 * No crypto UX is shown: it runs silently, one time per address, only if the
 * Move package is configured. Any failure is swallowed (the user still has a
 * fully working account — the Builder ID is a bonus, never a gate).
 */
export default function BuilderIdMinter() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { profile, isAuthed } = useAuth();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    const address = account?.address;
    if (!address || !isAuthed || !profile) return;
    if (!isMoveConfigured()) return; // package not published yet → skip silently
    if (handledRef.current === address) return;
    handledRef.current = address;

    let cancelled = false;
    (async () => {
      try {
        // Already has a Builder ID? Then nothing to do.
        const owned = await suiClient.getOwnedObjects({
          owner: address,
          filter: { StructType: BUILDER_ID_TYPE() },
          limit: 1,
        });
        if (cancelled || (owned.data?.length ?? 0) > 0) return;

        signAndExecute(
          { transaction: buildMintBuilderIdTx(profile.display_name) },
          {
            onError: (e) => console.warn('[builder-id] mint skipped:', e.message),
          }
        );
      } catch (e) {
        console.warn('[builder-id] check/mint failed:', e instanceof Error ? e.message : e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [account?.address, isAuthed, profile, suiClient, signAndExecute]);

  return null;
}
