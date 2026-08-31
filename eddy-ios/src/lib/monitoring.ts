// eddy-ios/src/lib/monitoring.ts
// Crash and error reporting. The only place this app talks to Sentry.
//
// ── Why this is load-bearing rather than nice-to-have ──────────────────────
//
// This app is built to degrade quietly, and it is good at it: a missing Mapbox
// token shows an explanatory panel, an unreachable Supabase falls back to
// local-only, a missing APNs entitlement just fails to get a push token. Every
// one of those paths ends in a console.warn and nothing else.
//
// In a TestFlight build a console.warn goes nowhere. So the exact failures a
// field test exists to find — a build shipped without one of its four
// EXPO_PUBLIC_ variables, an APNs key that was never uploaded — are invisible
// to everyone, and the app looks like it is merely missing features. That is
// what this file fixes, and it is why it lands before the first build rather
// than after: @sentry/react-native is a native module, so it cannot be added
// over the air later (ios.runtimeVersion is fingerprint-policy).
//
// ── Two deliberate restraints ──────────────────────────────────────────────
//
// NOTHING LEAVES UNREDACTED. See src/lib/redact.ts for the table and
// src/lib/scrub-event.ts for which fields of an event it is applied to —
// beforeSend and beforeBreadcrumb both run over it. Sentry's own server-side
// scrubbing is one hop too late for a token that should never have left the
// phone. The scrubber lives in its own module so the web app's test runner can
// load it without @sentry/react-native; it went a long time uncovered, and
// missing the field captureException actually writes to.
//
// NO PERFORMANCE TRACING, NO PII. tracesSampleRate is 0 and sendDefaultPii is
// false. We want crashes and handled errors; traces would spend the quota on
// data nobody is going to read, and PII is the thing the paragraph above is
// about.

import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { pickEnvironment } from '@/lib/app-environment';
import { isContextBag, redactContext, redactText, redactValue } from '@/lib/redact';
import { scrubEvent } from '@/lib/scrub-event';
import {
  createReportBudget,
  fingerprintOf,
  shouldReport,
} from '@/lib/report-budget';

/**
 * Build-time, deliberately.
 *
 * A DSN fetched from /api/app-config would arrive after the errors most worth
 * catching — a bad launch is exactly when the config request is also failing.
 */
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

/** False in Expo Go, in dev, and in any build shipped without a DSN. */
export const monitoringEnabled = Boolean(DSN);

/**
 * Subsystem tags already in use across the app's console.warn calls.
 *
 * 'launch' is the exception: nothing logs under it during normal operation. It
 * exists for src/lib/bootstrap.ts, and a report carrying it means the app never
 * finished starting — the one failure a field tester cannot describe and cannot
 * work around.
 */
export type LogTag =
  | 'fonts'
  | 'push'
  | 'map'
  | 'auth'
  | 'stars'
  | 'chart'
  | 'cache'
  | 'photo'
  | 'purchase'
  | 'launch'
  // How long the backend took, from the phone's side. Carries ROUTES and never
  // paths — see routeOf in src/lib/requestTiming.ts, which strips the slug, the
  // site id and the query before anything reaches here.
  | 'net'
  // First run resolves once per launch and then cannot be observed again on
  // that device. Without a tag naming which pane it chose, "I was not prompted"
  // is a report with nothing behind it — see resetFirstRun in onboarding.ts.
  | 'onboarding';

/**
 * Throttling state for warn(), for the life of the process.
 *
 * Module-level rather than per-call because a budget that resets on every call
 * is not a budget. It is deliberately NOT persisted: a fresh launch is a fresh
 * five minutes, which is the behaviour you want when someone force-quits after
 * hitting a bug and reopens to try again.
 */
const budget = createReportBudget();

/**
 * Call once, at module scope in app/_layout.tsx, before anything renders.
 *
 * Safe to call with no DSN: `enabled: false` makes every other Sentry call in
 * this file a no-op, so the app behaves identically and this can merge dark.
 */
export function initMonitoring(): void {
  // NEVER THROWS, and that is load-bearing rather than defensive.
  //
  // This is called at MODULE SCOPE in app/_layout.tsx, above
  // SplashScreen.preventAutoHideAsync(). A throw there is not an error the app
  // recovers from and reports — it stops the module evaluating, so React never
  // mounts, ThemedShell never lays out, hideAsync is never called, and the app
  // sits on the splash screen forever with no way out and nothing to read.
  //
  // Sentry.init touches a native module, which is precisely the class of thing
  // that fails on a fresh binary. So the crash reporter is not permitted to be
  // the reason there are no crash reports.
  try {
    initSentry();
  } catch (err) {
    console.warn('[monitoring] Sentry failed to initialise; continuing without it', err);
  }
}

function initSentry(): void {
  Sentry.init({
    dsn: DSN,
    enabled: monitoringEnabled,
    // Crashes and handled errors only — see the header.
    tracesSampleRate: 0,
    sendDefaultPii: false,
    // Distinguishes a field-test build from the App Store one in the dashboard.
    // Falls back rather than throwing: an unknown channel is worth less than a
    // crash report, and must never cost us one. See app-environment.ts for why
    // this stopped being an inline read of `extra.eas.channel`.
    environment: resolveEnvironment(),
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => {
      if (crumb.message) crumb.message = redactText(crumb.message);
      if (crumb.data) crumb.data = redactContext(crumb.data) as typeof crumb.data;
      return crumb;
    },
  });
}

/**
 * Read the update channel, then hand the decision to pickEnvironment().
 *
 * expo-updates is reached through a GUARDED REQUIRE rather than a static
 * import, and that is not superstition: this function runs inside Sentry.init,
 * which bootstrap.ts calls before anything else in the app. A static import
 * would put one more native module on the path that must not fail, in service
 * of a dashboard label. `Updates.channel` also throws outright when updates are
 * disabled for the build, which is a normal state, not an error.
 *
 * EXPORTED for one other caller: Profile shows its first-run reset only off
 * production. Everything about which build this is already lives here, and a
 * second copy of the channel read is how the two would come to disagree about
 * what "production" means.
 */
export function resolveEnvironment(): string {
  let updatesChannel: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    updatesChannel = (require('expo-updates') as typeof import('expo-updates')).channel ?? null;
  } catch {
    // Disabled, unavailable, or Expo Go. pickEnvironment handles the absence.
  }

  return pickEnvironment({
    updatesChannel,
    extraChannel: (Constants.expoConfig?.extra as { eas?: { channel?: string } } | undefined)?.eas
      ?.channel,
    isDev: __DEV__,
  });
}

/**
 * A subsystem failure that the app handled and carried on from.
 *
 * REPLACES the bare console.warn calls rather than sitting beside them — it
 * still writes to the console, so nothing is lost in development, and the
 * `[tag] message` shape is preserved exactly because that convention is what
 * makes these greppable.
 *
 * Reported at 'warning', not 'error': every call site here is a path the app
 * recovers from. Filing them as errors would bury a real crash under a hundred
 * "no signal at the put-in" reports.
 */
export function warn(tag: LogTag, message: string, detail?: unknown): void {
  // The console line is NOT throttled. In development it is the only signal
  // there is, and it costs nothing.
  console.warn(`[${tag}] ${message}`, detail ?? '');

  if (!monitoringEnabled) return;
  // Every warn() call site is a repeatable condition — see report-budget.ts.
  // Unthrottled, one misconfigured build exhausts a month of quota in a day and
  // the real crashes are dropped by the server after that.
  if (!shouldReport(budget, fingerprintOf(tag, message), Date.now())) return;

  Sentry.withScope((scope) => {
    scope.setTag('subsystem', tag);
    scope.setLevel('warning');
    attachDetail(scope, detail);
    Sentry.captureMessage(`[${tag}] ${message}`);
  });
}

/**
 * Attach whatever the caller passed as its third argument.
 *
 * Two shapes arrive here and both matter. Most call sites pass a caught error;
 * a few pass a bag of named fields (the Apple sign-in id check). Sending a bag
 * through String() yields "[object Object]" — a report that says a thing went
 * wrong and nothing about which thing — so a plain object is spread into named
 * extras and everything else is stringified.
 *
 * Errors are deliberately NOT treated as bags: their useful fields are not
 * enumerable, so spreading one produces `{}`.
 */
function attachDetail(scope: Sentry.Scope, detail: unknown): void {
  if (detail === undefined) return;

  if (isContextBag(detail)) {
    const extra = redactContext(detail);
    if (extra) for (const [key, value] of Object.entries(extra)) scope.setExtra(key, value);
    return;
  }

  scope.setExtra('detail', redactValue(detail));
}

/**
 * An unexpected throw, with whatever context helps identify it.
 *
 * Used by the root error boundary and by anything that catches something it
 * did not anticipate. Context values are redacted; keys are not.
 *
 * NOT THROTTLED, unlike warn(). An unhandled throw is rare, unrepeatable within
 * a session — the boundary has already replaced the screen — and the single
 * most valuable thing this system delivers. Budgeting it would spend the quota
 * on the noise and drop the signal.
 */
export function report(error: unknown, context?: Record<string, unknown>): void {
  if (!monitoringEnabled) return;

  Sentry.withScope((scope) => {
    const extra = redactContext(context);
    if (extra) for (const [key, value] of Object.entries(extra)) scope.setExtra(key, value);
    Sentry.captureException(error);
  });
}
