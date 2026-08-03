// eddy-ios/src/lib/redact.ts
// Strips likely secrets and personal data out of anything on its way to an
// error reporter.
//
// DUPLICATED from REDACTIONS in the web app's src/lib/monitoring/webhook-reporter.ts,
// and it has to be: that module imports @/lib/logger, a Next-only path alias, so
// it cannot be loaded from Metro. src/lib/redact.test.ts in the web app asserts
// the two tables still agree — the same arrangement ENTITLEMENT_ID uses, and for
// the same reason. A table that drifts fails silently, in the direction where a
// token ships to a third party.
//
// WHY THIS IS NOT OPTIONAL HERE. A crash reporter serialises whatever is
// attached to an error, and the things this app throws around are exactly the
// things that must not leave the phone: a Supabase access token rides in every
// /api/me/* request, `authed()` puts it in an Authorization header, and Apple's
// identityToken passes through signInWithApple. Sentry's own scrubbing runs
// server-side, which is one hop too late.

/** Ordered; each runs over the output of the last. */
const REDACTIONS: [RegExp, string][] = [
  // email addresses
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[redacted-email]'],
  // bearer/authorization values
  [/(bearer\s+)[\w.~+/=-]+/gi, '$1[redacted]'],
  // long hex blobs (tokens, HMACs, session ids)
  [/\b[0-9a-f]{32,}\b/gi, '[redacted-hex]'],
  // JWT-shaped triples — a Supabase session is three of these
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[redacted-jwt]'],
  // key=value style secrets
  [
    /((?:api[_-]?key|token|secret|password|authorization)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,
    '$1[redacted]',
  ],
  // latitude,longitude pairs
  //
  // The app computes position on the device and never sends it anywhere, so a
  // coordinate can only reach a reporter by riding along in a message — which
  // is exactly the case a redaction table is for, and which the privacy policy
  // states plainly is stripped.
  //
  // THREE decimal places minimum, and that is what keeps it from eating the
  // app's own numbers: a pair of gauge readings ("3.40, 2.80") or a river mile
  // and a distance are two decimals at most, while a real fix off Core Location
  // carries five or six. Roughly, three decimals is 100 m — below any precision
  // this app has reason to print about anything but a person.
  [/-?\b\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}\b/g, '[redacted-coords]'],
];

/** Longest single value we will carry. Keeps a huge body out of a report. */
const VALUE_LIMIT = 500;

export function redactText(input: string): string {
  let out = input;
  for (const [pattern, replacement] of REDACTIONS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Redact and cap any single value.
 *
 * Non-strings are stringified BEFORE redacting rather than passed through:
 * an object whose toString leaks a token is the case that motivates this, and
 * `null`/`undefined`/numbers/booleans cannot carry one, so they pass untouched
 * to keep a report readable.
 */
export function redactValue(value: unknown): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;

  const text = redactText(typeof value === 'string' ? value : String(value));
  return text.length > VALUE_LIMIT ? `${text.slice(0, VALUE_LIMIT)}…` : text;
}

/**
 * Is this a bag of named fields, or a single value?
 *
 * Decides whether a reporter spreads something into named extras or stringifies
 * it. Errors are deliberately NOT bags: their useful fields (`message`,
 * `stack`) are non-enumerable, so spreading one produces `{}` — a report that
 * says something went wrong and nothing about what. Arrays are not bags either;
 * numeric keys make unreadable extras.
 */
export function isContextBag(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof Error) &&
    !Array.isArray(value)
  );
}

/** Redact every value in a flat context bag. Keys are left alone. */
export function redactContext(
  context?: Record<string, unknown> | null,
): Record<string, unknown> | undefined {
  if (!context) return undefined;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) out[key] = redactValue(value);
  return out;
}
