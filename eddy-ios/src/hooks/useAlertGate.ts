// eddy-ios/src/hooks/useAlertGate.ts
// The two doors every alert has to pass through, in one place.
//
// Creating an alert is a write, but it is never just a write. It has to hold a
// permanent session — an anonymous one gets a 403 from the subscription routes
// — and once it succeeds it is the moment, and the only good moment, to ask
// iOS for permission to actually deliver the thing. Both screens that create
// alerts had grown their own copy of that dance:
//
//   app/alerts/configure.tsx  the full editor
//   app/river/[slug].tsx      the one-tap bell
//
// Same five steps in both, written twice: fetch a token, open the sign-in
// sheet if there isn't one, run the write, re-open that sheet on a 401 or 403
// because the remedy is identical, and spend the push primer on success if the
// OS permission is still undetermined. The copies had already drifted in the
// small ways two copies do — one caught 403 and the other 401 and 403 — which
// is the drift that matters here, because the branch nobody handles is the one
// where somebody taps a bell and nothing happens at all.
//
// ── What this owns, and what it does not ────────────────────────────────────
//
// It owns the gate: session, sheet visibility, primer visibility, and the busy
// flag. It does NOT own the write, the error copy, or what happens after — a
// threshold rule that comes back saying "the river is already above your
// level" has something to say that a one-tap safety bell does not, and folding
// those together would be a worse abstraction than the duplication.
//
// The retry after signing in is the reason `run` is re-entrant: the sheet's
// onSignedIn calls the very same function that just failed, now with a session
// behind it.

import { useCallback, useState } from 'react';
import { ApiError } from '@/api/client';
import { usePush } from '@/hooks/usePush';
import { useSession } from '@/hooks/useSession';

/** What actually happened, so a caller can navigate deterministically. */
export interface AlertGateResult {
  /** True only when the write ran and returned. False means it never started. */
  wrote: boolean;
  /** True when the push primer was opened, and is now covering the screen. */
  primed: boolean;
}

export interface AlertGate {
  /**
   * Run an alert write behind the gate.
   *
   * The callback receives a token that is guaranteed non-null. Throwing an
   * ApiError with 401 or 403 re-opens the sign-in sheet instead of surfacing;
   * anything else is re-thrown for the caller's own error copy.
   *
   * `primes` says whether success means an alert now EXISTS. Default true,
   * because that is what the primer is for; pass false for a write that
   * removes one. Asking someone for permission to send notifications at the
   * moment they turned notifications off is the kind of prompt people revoke
   * an app's access over, and it would be spending a one-shot to do it.
   */
  run: (
    write: (token: string) => Promise<void>,
    options?: { primes?: boolean },
  ) => Promise<AlertGateResult>;
  /** True while a write is in flight. Drive the button's spinner off this. */
  busy: boolean;
  signInOpen: boolean;
  setSignInOpen: (open: boolean) => void;
  primerOpen: boolean;
  setPrimerOpen: (open: boolean) => void;
  /**
   * Spends the one-shot iOS prompt. Call from the primer's Allow.
   *
   * Its resolved permission state is deliberately not surfaced: the alert
   * already exists either way, and someone who declines still sees every
   * change in the Alerts feed.
   */
  enablePush: () => Promise<unknown>;
}

export function useAlertGate(): AlertGate {
  const { getAccessToken } = useSession();
  const { permission, enable } = usePush();
  const [busy, setBusy] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [primerOpen, setPrimerOpen] = useState(false);

  const run = useCallback(
    async (write: (token: string) => Promise<void>, options?: { primes?: boolean }) => {
      const primes = options?.primes ?? true;
      setBusy(true);
      try {
        const token = await getAccessToken();
        if (!token) {
          setSignInOpen(true);
          return { wrote: false, primed: false };
        }

        await write(token);

        // The subscription exists — now, and only now, is it worth spending
        // the one-shot iOS permission prompt: there is a concrete notification
        // waiting to be delivered, which is the strongest case this app will
        // ever have. Asking earlier burns it on a hypothetical. See the header
        // of src/lib/push.ts for why there is exactly one chance at this.
        const primed = primes && permission === 'undetermined';
        if (primed) setPrimerOpen(true);
        // RETURNED, not read back off state. A caller deciding whether to pop
        // the screen has to know now; `primerOpen` has not re-rendered yet,
        // and reading it here would always say false and dismiss the primer's
        // own screen out from under it.
        return { wrote: true, primed };
      } catch (err) {
        // 401 is no session; 403 is an anonymous one, which the subscription
        // routes refuse. Different causes, one remedy, and the screens used to
        // disagree about which of the two they caught.
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          setSignInOpen(true);
          return { wrote: false, primed: false };
        }
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [getAccessToken, permission],
  );

  return { run, busy, signInOpen, setSignInOpen, primerOpen, setPrimerOpen, enablePush: enable };
}
