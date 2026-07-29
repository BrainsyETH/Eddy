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
import * as AppleAuthentication from 'expo-apple-authentication';
import type { Session } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { updateDisplayName } from '@/api/client';
import { warn } from '@/lib/monitoring';

interface SessionValue {
  session: Session | null;
  /** False until the first restore-or-sign-in attempt settles. */
  ready: boolean;
  /** True once we know an account is unavailable — local-only from here. */
  unavailable: boolean;
  /** A fresh access token, or null. Refreshes if the cached one has expired. */
  getAccessToken: () => Promise<string | null>;
  /**
   * True while the session belongs to an anonymous user — someone who has
   * stars but no account. Purchases and push both require this to be false.
   */
  isAnonymous: boolean;
  /** Upgrade the current identity with Apple. Throws with a message to show. */
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Drop the local session after the server has deleted the account. */
  forgetSession: () => Promise<void>;
}

const SessionContext = createContext<SessionValue>({
  session: null,
  ready: false,
  unavailable: true,
  getAccessToken: async () => null,
  isAnonymous: true,
  signInWithApple: async () => {},
  signOut: async () => {},
  forgetSession: async () => {},
});

/** Thrown when the user backs out of the Apple sheet — never shown as an error. */
export const APPLE_SIGN_IN_CANCELLED = 'apple_sign_in_cancelled';

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
          warn('auth', 'anonymous sign-in unavailable', error.message);
          setUnavailable(true);
          return;
        }
        setSession(created.session);
      } catch (err) {
        // Offline on first launch lands here. Not terminal: the next launch
        // with signal will try again.
        warn('auth', 'could not establish a session', err);
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

  /**
   * Sign in with Apple, UPGRADING the current anonymous user rather than
   * replacing it.
   *
   * This is the whole reason the app starts anonymous. `signInWithIdToken`
   * against an existing anonymous session links the Apple identity to that same
   * user id, so the stars someone accumulated before converting are already
   * theirs — nothing is migrated, because nothing moved. It is also why the
   * purchase flow must run AFTER this: RevenueCat is keyed on the Supabase user
   * id, and an entitlement bought under an anonymous id would be stranded the
   * first time that id was replaced.
   */
  const signInWithApple = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Accounts are unavailable right now.');

    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
    } catch (err) {
      // Backing out of the sheet is not a failure and must not surface as one.
      if ((err as { code?: string })?.code === 'ERR_REQUEST_CANCELED') {
        throw new Error(APPLE_SIGN_IN_CANCELLED);
      }
      throw new Error('Could not reach Apple. Please try again.');
    }

    if (!credential.identityToken) {
      throw new Error('Apple did not return a sign-in token. Please try again.');
    }

    // Read the OUTGOING identity from supabase rather than from a closure —
    // this callback has no deps and would otherwise capture a stale session.
    const { data: before } = await supabase.auth.getSession();
    const previousId = before.session?.user?.id ?? null;
    const previousWasAnonymous = before.session?.user?.is_anonymous ?? null;

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (error) throw new Error(error.message);
    if (data.session) setSession(data.session);

    // ── Does the upgrade actually preserve the user id? ──────────────────
    //
    // The docblock above asserts it does, and three separate things are built
    // on that assertion: the stars story here, RevenueCat's appUserID in
    // purchases.ts, and push identity in usePush. Nothing anywhere verifies it,
    // so this makes the assumption observable instead of assumed. It is
    // instrumentation, not a fix — there is nothing to repair unless it fires.
    //
    // A MISMATCH IS NOT AUTOMATICALLY A BUG, which is why this reports rather
    // than throws. On reinstall the app mints a fresh anonymous user, and
    // signing in with an Apple ID that already has an account correctly returns
    // THAT account — a different id and the right answer. The case that would
    // matter is a FIRST conversion, where an anonymous user with accumulated
    // state signs in and Supabase mints a new user instead of linking; the
    // remedy there is Supabase's documented linkIdentity() flow, and it would
    // be a P0 before any purchase ships.
    //
    // The two are told apart by whether the abandoned id had server-side rows,
    // which only the backend can answer — hence both ids in the report.
    const nextId = data.session?.user?.id ?? null;
    if (previousId && nextId && previousId !== nextId) {
      warn('auth', 'Apple sign-in changed the user id', {
        previousId,
        nextId,
        previousWasAnonymous,
      });
    }

    // Apple sends the real name EXACTLY ONCE, on the very first authorisation
    // for this Apple ID, and never again — not on re-install, not on
    // re-authorisation. If it is not persisted here it is gone for good, so
    // this write is deliberately not deferred to a later "complete your
    // profile" step. Failure is non-fatal: a missing display name costs a
    // greeting, not access.
    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(' ')
      .trim();

    if (fullName && data.session) {
      try {
        await updateDisplayName(data.session.access_token, fullName);
      } catch {
        // ignored on purpose — see above
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  /**
   * Clear the local session WITHOUT calling the server.
   *
   * Used after account deletion, where signOut() would post to an endpoint
   * whose user no longer exists. `scope: 'local'` drops the stored session and
   * skips the network call.
   */
  const forgetSession = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    setSession(null);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      session,
      ready,
      unavailable,
      getAccessToken,
      // Absent claim means anonymous: a session that predates the claim is not
      // a signed-in one, and treating an unknown as permanent would let it
      // reach the purchase path.
      isAnonymous: session?.user?.is_anonymous ?? true,
      signInWithApple,
      signOut,
      forgetSession,
    }),
    [session, ready, unavailable, getAccessToken, signInWithApple, signOut, forgetSession],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  return useContext(SessionContext);
}
