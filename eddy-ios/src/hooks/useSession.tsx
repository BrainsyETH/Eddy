// eddy-ios/src/hooks/useSession.tsx
// An anonymous identity, acquired silently on first launch.
//
// WHY ANONYMOUS AND NOT A SIGN-IN WALL: starring a river is the investment that
// comes BEFORE any paywall ask, so it has to cost nothing — no account, no
// email, no interruption. An anonymous Supabase user gives stars somewhere to
// live server-side without the user ever seeing a login screen, and Sign in with
// Apple later UPGRADES that same user id, so nothing needs re-syncing at the
// point they convert.
//
// Every failure here is non-fatal. The app is fully usable with no session at
// all — Favorites simply stays on-device — so no error from this hook should
// ever reach the user.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

interface SessionValue {
  session: Session | null;
  /** False until the first restore-or-sign-in attempt settles. */
  ready: boolean;
  /** True once we know an account is unavailable — local-only from here. */
  unavailable: boolean;
  /** A fresh access token, or null. Refreshes if the cached one has expired. */
  getAccessToken: () => Promise<string | null>;
}

const SessionContext = createContext<SessionValue>({
  session: null,
  ready: false,
  unavailable: true,
  getAccessToken: async () => null,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(!isSupabaseConfigured);
  // Guards against a second sign-in racing the first and creating two anonymous
  // users for one device — each would own a different half of the stars.
  const signingIn = useRef(false);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setUnavailable(true);
      setReady(true);
      return;
    }

    let cancelled = false;

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!cancelled) setSession(next);
    });

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;

        if (data.session) {
          setSession(data.session);
          return;
        }

        if (signingIn.current) return;
        signingIn.current = true;

        const { data: created, error } = await supabase.auth.signInAnonymously();
        if (cancelled) return;

        if (error) {
          // The common cause is anonymous sign-ins being switched off in the
          // Supabase dashboard, which returns 422 anonymous_provider_disabled.
          // That is a configuration state, not a bug, and the app carries on
          // local-only — so this is a warning, never a user-visible error.
          console.warn('[auth] anonymous sign-in unavailable:', error.message);
          setUnavailable(true);
          return;
        }
        setSession(created.session);
      } catch (err) {
        // Offline on first launch lands here. Not terminal: the next launch
        // with signal will try again.
        console.warn('[auth] could not establish a session', err);
        setUnavailable(true);
      } finally {
        signingIn.current = false;
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      subscription?.subscription?.unsubscribe();
    };
  }, []);

  const getAccessToken = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return null;
    try {
      // getSession refreshes an expired token rather than handing one back, so
      // this is preferred over reading session.access_token from state, which
      // can be stale after a long backgrounding.
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ session, ready, unavailable, getAccessToken }),
    [session, ready, unavailable, getAccessToken],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  return useContext(SessionContext);
}
