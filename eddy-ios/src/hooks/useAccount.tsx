// eddy-ios/src/hooks/useAccount.tsx
// The caller's profile and entitlement, loaded from /api/me/profile.
//
// Deliberately a hook rather than a provider: only the Profile tab needs this
// today, and fetching it app-wide would put an authenticated request on the
// critical path of every cold start for a screen most launches never open.
//
// Entitlement is READ, never decided. `isActive` comes from the server, which
// derives it from expires_at — a device clock is trivially wrong and sometimes
// set forward deliberately.

import { useCallback, useEffect, useState } from 'react';
import type { MeEntitlement, MeProfile } from '@eddy/types';
import { fetchMeProfile } from '@/api/client';
import { useSession } from '@/hooks/useSession';
import { identifyUser } from '@/lib/purchases';

interface AccountState {
  profile: MeProfile | null;
  entitlement: MeEntitlement | null;
  /** False until the first load settles, so the UI can hold rather than flash. */
  loaded: boolean;
  /** Set when the account exists but could not be reached. */
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAccount(): AccountState {
  const { session, ready, isAnonymous, getAccessToken } = useSession();
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [entitlement, setEntitlement] = useState<MeEntitlement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = session?.user?.id ?? null;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const token = await getAccessToken();
      if (!token) {
        setProfile(null);
        setEntitlement(null);
        setError(null);
        setLoaded(true);
        return;
      }

      try {
        const data = await fetchMeProfile(token, signal);
        if (signal?.aborted) return;

        setProfile(data?.profile ?? null);
        setEntitlement(data?.entitlement ?? null);
        setError(null);
      } catch {
        if (signal?.aborted) return;
        // Offline is the expected case, not an exceptional one. The screen
        // still renders — it just cannot show subscription state.
        setError('Could not reach your account. Check your connection.');
      } finally {
        if (!signal?.aborted) setLoaded(true);
      }
    },
    [getAccessToken],
  );

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [ready, userId, load]);

  // Point RevenueCat at this user as soon as there is a permanent one. Doing it
  // here rather than at app start is what keeps an anonymous id from ever
  // becoming an appUserID — see src/lib/purchases.ts.
  useEffect(() => {
    if (!userId || isAnonymous) return;
    void identifyUser(userId, isAnonymous);
  }, [userId, isAnonymous]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  return { profile, entitlement, loaded, error, refresh };
}
