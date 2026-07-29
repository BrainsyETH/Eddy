// src/lib/monitoring/redact.ts
// The redaction table, and nothing else.
//
// ── Why this is its own file ───────────────────────────────────────────────
//
// It lived in webhook-reporter.ts, which was fine while both consumers were
// server-side. The browser Sentry client needs the same table — the iOS app
// learned this lesson first, and eddy-ios/src/lib/redact.ts exists for exactly
// the same reason — and importing it from webhook-reporter.ts would drag that
// module's fetch-based sink, its dedupe state and its cooldown timers into
// every page's JavaScript to reuse six regexes.
//
// So the table moves here and webhook-reporter.ts re-exports it. Nothing that
// imported `redactText` from there has to change, including
// src/lib/redact.test.ts, which pins this table against the iOS app's copy.
//
// ── Why redaction happens here and not in Sentry ───────────────────────────
//
// Sentry's server-side scrubbing is one hop too late for a value that should
// never have left the process. It also protects GROUPING as much as privacy:
// Sentry groups on the message, so an unredacted email mints one issue per user
// and buries the fault under its own victims.

// Strip likely secrets and personal data before anything leaves the process.
const REDACTIONS: Array<[RegExp, string]> = [
  // email addresses
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[redacted-email]'],
  // bearer/authorization values
  [/(bearer\s+)[\w.~+/=-]+/gi, '$1[redacted]'],
  // long hex blobs (tokens, HMACs, session ids)
  [/\b[0-9a-f]{32,}\b/gi, '[redacted-hex]'],
  // JWT-shaped triples
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[redacted-jwt]'],
  // key=value style secrets
  [/((?:api[_-]?key|token|secret|password|authorization)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1[redacted]'],
];

export function redactText(input: string): string {
  let out = input;
  for (const [pattern, replacement] of REDACTIONS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}
