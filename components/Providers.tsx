'use client';

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  SuiClientProvider,
  WalletProvider,
  useSuiClientContext,
} from '@mysten/dapp-kit';
import { isEnokiNetwork, registerEnokiWallets } from '@mysten/enoki';

import { networkConfig, SUI_NETWORK } from '@/lib/sui';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/lib/toast';

/** Registers Enoki-backed wallets (Google zkLogin) into the dapp-kit wallet list. */
function RegisterEnokiWallets() {
  const { client, network } = useSuiClientContext();

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_ENOKI_API_KEY;
    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    // No Enoki/Google config → skip silently. The app still runs; login is disabled.
    if (!apiKey || !googleClientId) return;
    if (!isEnokiNetwork(network)) return;

    const { unregister } = registerEnokiWallets({
      apiKey,
      providers: {
        google: { clientId: googleClientId },
        // Apple/Facebook can be added here once configured in the Enoki portal.
      },
      client,
      network,
    });

    return unregister;
  }, [client, network]);

  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  // One QueryClient per app instance.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={SUI_NETWORK}>
        <RegisterEnokiWallets />
        <WalletProvider autoConnect>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
