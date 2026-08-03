// eddy-ios/src/lib/scrub-event.ts
// Redacting a crash report on its way out, field by field.
//
// ── Why this is not inside monitoring.ts ───────────────────────────────────
//
// It was, and it was untested for the whole time it was — because monitoring.ts
// imports @sentry/react-native, so the web app's Node test runner cannot load
// it, and eddy-ios has no runner of its own. The one part of the reporter that
// decides what a third party is allowed to see was the part nothing could
// check.
//
// Pulling it out here, with no native imports and a structural event type,
// makes it ordinary pure code that src/lib/scrub-event.test.ts in the web app
// covers directly. Same arrangement as redact.ts beside it, and for the same
// reason.
//
// ── The field this was missing, and why it mattered most ───────────────────
//
// The old version scrubbed `message` and `extra`. Neither is where a thrown
// error's text lands: Sentry.captureException(err) puts it in
// `exception.values[].value`, and that is the path report() takes for every
// caught error and the global handlers take for every uncaught one. So the
// highest-volume route out of the app was the one route with no redaction on
// it, under a header in monitoring.ts asserting that nothing leaves
// unredacted.
//
// What could ride along there is not hypothetical: authed() puts a Supabase
// access token in an Authorization header on every /api/me/* request, and
// supabase-js and fetch both quote request detail back in the messages they
// throw.
//
// ── Structural, not Sentry's own type ──────────────────────────────────────
//
// Taking `ScrubbableEvent` rather than Sentry's `Event` is what keeps this
// module free of the native import. Sentry's event satisfies it structurally,
// so beforeSend passes one straight in. The trade is that a field Sentry adds
// later is not scrubbed until it is named here — which is why the fields are
// listed rather than walked: a scrubber that recursed everything would also
// rewrite the stack frames and breadcrumb structure it does not understand.

import { redactContext, redactText } from './redact';

/** The fields of a Sentry event that can carry text we wrote. */
export interface ScrubbableEvent {
  message?: unknown;
  extra?: unknown;
  logentry?: { message?: unknown } | null;
  exception?: { values?: ({ value?: unknown } | null)[] | null } | null;
}

/**
 * Redact every text-bearing field of an event, in place.
 *
 * Mutates and returns the same object, which is what Sentry's `beforeSend`
 * contract expects.
 */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  if (typeof event.message === 'string') event.message = redactText(event.message);

  if (event.extra && typeof event.extra === 'object') {
    event.extra = redactContext(event.extra as Record<string, unknown>);
  }

  // The formatted-message path. Rare from this app, but it is text we wrote and
  // it costs one line to cover.
  if (event.logentry && typeof event.logentry.message === 'string') {
    event.logentry.message = redactText(event.logentry.message);
  }

  // The one that matters: every captureException lands here.
  for (const value of event.exception?.values ?? []) {
    if (value && typeof value.value === 'string') value.value = redactText(value.value);
  }

  return event;
}
