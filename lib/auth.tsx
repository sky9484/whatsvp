'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import {
  useCurrentAccount,
  useCurrentWallet,
  useWallets,
  useConnectWallet,
  useDisconnectWallet,
  useSignPersonalMessage,
} from '@mysten/dapp-kit';
import { isGoogleWallet, getSession } from '@mysten/enoki';
import type { Profile } from './types';
import { buildLoginMessage } from './authMessage';
import { useToast } from './toast';

type AuthStatus = 'idle' | 'connecting' | 'authing' | 'authed' | 'error';

interface AuthContextValue {
  /** The connected Sui account (address only). Null when logged out. */
  address: string | null;
  /** The user's WhatsVP profile (display name, avatar). Null until session created. */
  profile: Profile | null;
  /** Supabase session token (for RLS-authed writes). Null if not minted. */
  token: string | null;
  status: AuthStatus;
  error: string | null;
  isAuthed: boolean;
  /** True if Enoki/Google is configured so login is possible. */
  canLogin: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

/** Read the OIDC `sub` claim from a JWT without verifying (best-effort, for profile tagging). */
function decodeJwtSub(jwt: string): string | null {
  try {
    const payload = jwt.split('.')[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.sub === 'string' ? json.sub : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const account = useCurrentAccount();
  const { currentWallet } = useCurrentWallet();
  const wallets = useWallets();
  const connectMutation = useConnectWallet();
  const disconnectMutation = useDisconnectWallet();
  const signMessageMutation = useSignPersonalMessage();
  const toast = useToast();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // Track which address we've already authed to avoid re-posting on every render.
  const authedAddressRef = useRef<string | null>(null);

  const googleWallet = wallets.find((w) => isGoogleWallet(w));
  const canLogin = Boolean(googleWallet);

  const login = useCallback(() => {
    setError(null);
    if (!googleWallet) {
      setError('Login is not configured yet. Set the Enoki + Google keys.');
      setStatus('error');
      toast.show('Accounts need Enoki + Google keys — see the README to enable login.', 'info');
      return;
    }
    setStatus('connecting');
    connectMutation.mutate(
      { wallet: googleWallet },
      {
        onError: (e) => {
          setError(e.message);
          setStatus('error');
        },
      }
    );
  }, [googleWallet, connectMutation, toast]);

  const logout = useCallback(() => {
    disconnectMutation.mutate();
    setProfile(null);
    setToken(null);
    setStatus('idle');
    authedAddressRef.current = null;
  }, [disconnectMutation]);

  // When an account connects, create/find the profile and mint the session.
  useEffect(() => {
    const address = account?.address ?? null;

    if (!address) {
      // Disconnected
      if (authedAddressRef.current !== null) {
        setProfile(null);
        setToken(null);
        setStatus('idle');
        authedAddressRef.current = null;
      }
      return;
    }

    if (authedAddressRef.current === address) return; // already handled
    authedAddressRef.current = address;

    let cancelled = false;
    (async () => {
      setStatus('authing');
      setError(null);

      // Best-effort: pull the OAuth `sub` from the zkLogin session for profile tagging.
      let oauthSub: string | null = null;
      try {
        if (currentWallet) {
          const session = await getSession(currentWallet);
          if (session?.jwt) oauthSub = decodeJwtSub(session.jwt);
        }
      } catch {
        // non-fatal — oauth_sub is optional
      }

      // Prove control of the address by signing a fresh login message.
      // Enoki signs with its ephemeral key — no extra user prompt.
      let bytes: string;
      let signature: string;
      try {
        const message = new TextEncoder().encode(buildLoginMessage(address, Date.now()));
        const signed = await signMessageMutation.mutateAsync({ message });
        bytes = signed.bytes;
        signature = signed.signature;
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not sign in');
        setStatus('error');
        return;
      }

      try {
        const res = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sui_address: address, bytes, signature, oauth_sub: oauthSub }),
        });
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setError(data.error ?? 'Failed to create session');
          setStatus('error');
          return;
        }
        setProfile(data.profile);
        setToken(data.token ?? null);
        setStatus('authed');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Network error');
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [account?.address, currentWallet]);

  const value: AuthContextValue = {
    address: account?.address ?? null,
    profile,
    token,
    status,
    error,
    isAuthed: status === 'authed' && Boolean(account?.address),
    canLogin,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
