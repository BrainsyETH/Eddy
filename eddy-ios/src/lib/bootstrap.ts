// eddy-ios/src/lib/bootstrap.ts
// The first module the app evaluates, and the only one that may assume nothing
// else has run yet.
//
// ── The hole this closes ───────────────────────────────────────────────────
//
// app/_layout.tsx used to own three things at module scope: initMonitoring(),
// SplashScreen.preventAutoHideAsync(), and an 8-second timer that hides the
// splash no matter what. Its comment argued the timer was safe because it "runs
// at module scope, outside React entirely, so no render failure can prevent
// it."
//
// That is true of RENDER failures and false of IMPORT failures, which is the
// gap. ES module bodies run AFTER every one of their imports has been
// evaluated, and _layout.tsx's import graph is not inert:
//
//   * src/hooks/usePush.tsx calls installForegroundHandler() at module scope —
//     a native expo-notifications call, deliberately placed there so a
//     notification arriving on a cold start is not missed.
//   * @/lib/monitoring pulls in @sentry/react-native.
//   * @/lib/supabase pulls in expo-secure-store and a global URL polyfill.
//
// Any one of those throwing means _layout.tsx's body never runs. React never
// mounts, the root ErrorBoundary never exists, Sentry was never initialised,
// and the backstop timer was never scheduled. The app sits on the splash screen
// forever and reports NOTHING — not a console line, not a crash, not an event.
// The single worst failure mode the app has was also its only invisible one.
//
// ── Why this file has no static imports ────────────────────────────────────
//
// A module with imports can fail to evaluate for the same reason the ones above
// can. This one resolves everything through a guarded require() instead, so
// there is no code path on which it does not finish. That is the entire point:
// it is the floor, and a floor with a hole in it is not a floor.
//
// Importing it FIRST in app/_layout.tsx is what makes the ordering work.
// Imports are evaluated in source order, so it runs before expo-notifications,
// Sentry or Supabase have been touched.
//
// ── What it buys ───────────────────────────────────────────────────────────
//
// Sentry.init installs React Native's global ErrorUtils handler. Arming it here
// — before the risky imports rather than after them — is what turns "an
// unattributable hang" into "an exception in the dashboard with a stack".

/** How long the splash may stay up before we assume the launch is stuck. */
const SPLASH_BACKSTOP_MS = 8_000;

/** Only the two calls this file makes; typed locally so nothing is imported. */
type SplashModule = {
  preventAutoHideAsync: () => Promise<boolean>;
  hideAsync: () => Promise<boolean>;
};

function loadSplash(): SplashModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-splash-screen') as SplashModule;
  } catch (err) {
    console.warn('[bootstrap] expo-splash-screen unavailable', err);
    return null;
  }
}

const splash = loadSplash();

let launched = false;
let stalled = false;
const stallListeners = new Set<() => void>();

// Hold the native splash until the app has painted. Without this the app
// renders a frame in the system font and then reflows when Geist arrives — a
// visible pop on every cold start.
//
// Failures are swallowed: a splash that will not hide is a bricked app, so
// nothing on this path may throw.
splash?.preventAutoHideAsync().catch(() => {});

/**
 * ARMED BEFORE ANYTHING ELSE, deliberately.
 *
 * Sentry is initialised on the next line rather than this one because this
 * timer is the thing that must never fail to install. initMonitoring() already
 * cannot throw; this ordering means it would not matter if it could.
 */
const backstop = setTimeout(onBackstop, SPLASH_BACKSTOP_MS);

initMonitoringGuarded();

/**
 * Bring up crash reporting before the imports it exists to observe.
 *
 * Guarded require rather than a static import for the reason in the header: a
 * broken native module in the crash reporter must not become the reason there
 * are no crash reports.
 */
function initMonitoringGuarded(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('./monitoring') as typeof import('./monitoring')).initMonitoring();
  } catch (err) {
    console.warn('[bootstrap] monitoring failed to initialise; continuing without it', err);
  }
}

function onBackstop(): void {
  if (launched) return;
  stalled = true;

  // Lift the splash first. Whatever is underneath — a half-mounted tree, the
  // root ErrorBoundary, or the stall screen app/_layout.tsx renders — is
  // strictly better than a launch image that never goes away.
  splash?.hideAsync().catch(() => {});

  // Then say so. This is the report that did not exist before: the app was
  // built to degrade quietly and this is the one failure where quiet means
  // nobody ever finds out.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { warn } = require('./monitoring') as typeof import('./monitoring');
    warn(
      'launch',
      `splash backstop fired after ${SPLASH_BACKSTOP_MS}ms; the app never finished starting`,
    );
  } catch {
    // Monitoring is the thing that may not have loaded. Nothing to do.
  }

  for (const listener of stallListeners) {
    try {
      listener();
    } catch {
      // A listener that throws must not stop the others.
    }
  }
}

/**
 * The app has painted. Hides the splash and disarms the backstop.
 *
 * Called from the first onLayout of the themed shell, so the splash lifts onto
 * a painted, correctly-themed screen rather than a blank one.
 */
export function completeLaunch(): void {
  if (launched) return;
  launched = true;
  clearTimeout(backstop);
  splash?.hideAsync().catch(() => {});
}

/** True once the backstop has fired without the app having painted. */
export function isLaunchStalled(): boolean {
  return stalled;
}

/**
 * Watch for the stall so the UI can say something instead of showing a blank
 * screen. Returns an unsubscribe function, shaped for useEffect.
 */
export function subscribeToLaunchStall(listener: () => void): () => void {
  if (stalled) {
    // Already fired — tell the caller now rather than never.
    listener();
    return () => {};
  }
  stallListeners.add(listener);
  return () => {
    stallListeners.delete(listener);
  };
}
