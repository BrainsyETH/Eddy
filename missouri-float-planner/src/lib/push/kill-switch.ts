// src/lib/push/kill-switch.ts
// The one place that answers "are we allowed to push right now?".
//
// ── Why there are two switches, and why both had to be read ───────────────
//
// `EXPO_PUSH_ENABLED=false` is an env var: it needs a redeploy to flip, which
// is exactly what you do not have time for when a bad release is mass-pushing.
//
// `app_config.push_enabled` is the row 00191 added for that reason — its header
// calls it a no-deploy kill switch. But nothing on the send path ever read it.
// It was served to clients at /api/app-config and consulted by no one, so
// flipping the row silenced the app's opt-in UI while the fan-out carried on
// sending. The lever that looked like the emergency stop was the one that did
// the least.
//
// Reading both, with either able to stop a send, is the only arrangement in
// which the documented behaviour is the real behaviour.

/**
 * Fails OPEN by design.
 *
 * A config lookup that errors must not silence alerts — a database hiccup would
 * otherwise become a total notification outage, including the safety warnings.
 * Stopping push is a decision someone makes, never something that happens.
 */
export async function pushDisabledReason(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<string | null> {
  if (process.env.EXPO_PUSH_ENABLED === 'false') return 'EXPO_PUSH_ENABLED=false';

  const { data, error } = await supabase
    .from('app_config')
    .select('push_enabled')
    .maybeSingle();

  if (error || !data) return null;
  return data.push_enabled === false ? 'app_config.push_enabled=false' : null;
}
