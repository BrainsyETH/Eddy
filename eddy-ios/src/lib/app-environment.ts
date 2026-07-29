// eddy-ios/src/lib/app-environment.ts
// Which build this is, as Sentry's `environment` tag.
//
// ── Why this is not a one-liner ────────────────────────────────────────────
//
// monitoring.ts used to read the channel from
// `Constants.expoConfig?.extra?.eas?.channel`, with a comment saying the field
// "distinguishes a field-test build from the App Store one in the dashboard".
// It never did. app.json's `extra.eas` holds `projectId` and nothing else, and
// EAS does not inject a channel there — so the `?? 'unknown'` fallback fired on
// every build ever made, and preview and production were indistinguishable in
// Sentry. A tag whose whole purpose is telling two builds apart had the same
// value for both.
//
// The channel lives in expo-updates (`Updates.channel`), which is already a
// dependency and is what `eas.json`'s `"channel": "preview"` actually sets.
//
// The resolution is split out here, pure, because the bug was in the CHOICE and
// not in the plumbing — a test can hold every input combination at once, which
// is exactly what nobody could do with a native module read inline.

/** Everything the answer depends on. All optional: any of them can be absent. */
export interface EnvironmentInputs {
  /** `Updates.channel` — set by eas.json's `channel`. Empty on a local build. */
  updatesChannel?: string | null;
  /** The legacy `extra.eas.channel` read. Kept as a fallback, never removed. */
  extraChannel?: string | null;
  /** React Native's `__DEV__`. */
  isDev?: boolean;
}

/**
 * The Sentry environment tag for this build.
 *
 * Order matters and each step earns its place:
 *
 *   1. `Updates.channel` — the real answer for anything EAS built.
 *   2. `extra.eas.channel` — kept because a future config could start setting
 *      it, and because dropping a fallback while fixing the thing it backed up
 *      is how a fix becomes a regression.
 *   3. `'development'` when `__DEV__` — a dev-server run genuinely has no
 *      channel, and filing those as 'unknown' would bury a real unknown among
 *      hundreds of them.
 *   4. `'unknown'` — now meaningful. It means a release build that could not
 *      say which channel it came from, which is worth noticing rather than
 *      being the answer everything gets.
 *
 * Whitespace-only values are treated as absent: `Updates.channel` is `''` on a
 * build made without a channel, and an empty string is not an environment.
 */
export function pickEnvironment({
  updatesChannel,
  extraChannel,
  isDev,
}: EnvironmentInputs): string {
  const fromUpdates = trimmed(updatesChannel);
  if (fromUpdates) return fromUpdates;

  const fromExtra = trimmed(extraChannel);
  if (fromExtra) return fromExtra;

  return isDev ? 'development' : 'unknown';
}

function trimmed(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const out = value.trim();
  return out.length > 0 ? out : null;
}
