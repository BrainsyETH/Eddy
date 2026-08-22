// scripts/lib/db.ts
//
// The one way an operator script opens a Supabase connection.
//
// Before this existed, every script hand-rolled three things — .env.local
// parsing, credential-name resolution, and (in four scripts out of ~40) the
// EXPECTED_SUPABASE_REF write guard. docs/data-pipeline.md had to document the
// result as "the env you load is the database you mutate." This module turns
// that convention into a mechanism:
//
//   * getScriptClient({ script, write: false }) — a read connection. Prints
//     the resolved project ref so the operator always sees the target.
//   * getScriptClient({ script, write: true })  — a MUTATING connection.
//     Refuses to construct unless EXPECTED_SUPABASE_REF is set in the live
//     shell AND matches the project the credentials resolve to. The refusal
//     message contains the exact export line, so the cost of the ceremony is
//     one paste per shell — and the message names the ref, so the operator has
//     read which project they are confirming.
//
// A dry-run script passes its computed apply flag as `write`: preview passes
// need no pin, the same invocation with --apply does. The pin requirement is a
// deliberate behavior change from the old optional guard; the enforcement test
// (scripts/lib/no-unguarded-clients.test.ts) keeps new scripts from routing
// around it.
//
// .env.local semantics (loadEnvLocal):
//   * The file is AUTHORITATIVE — it overrides the shell, matching the most
//     recent hand-rolled loaders (fetch-drainage-areas.ts: a stale exported
//     key must not shadow the project's real one).
//   * EXCEPT EXPECTED_SUPABASE_REF, which is read from the real shell only. The
//     pin is the operator's live confirmation of the target; a pin stored next
//     to the credentials it confirms is a rubber stamp, not a confirmation.
//
// Pure logic (name resolution, ref parsing, the guard verdict) lives in
// src/lib/env.ts so the app and the test suite share it; this file owns only
// the script-side ceremony: file loading, console output, and process exit.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { checkWriteTarget, resolveSupabaseAdmin } from '../../src/lib/env';

let envLocalLoaded = false;

/**
 * Load .env.local from the current working directory (scripts run from inside
 * missouri-float-planner/) into process.env. Idempotent; silently a no-op when
 * the file does not exist, in which case the exported shell env is all there is.
 */
export function loadEnvLocal(): void {
  if (envLocalLoaded) return;
  envLocalLoaded = true;

  let txt: string;
  try {
    txt = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
  } catch {
    return; // no .env.local — rely on exported env vars
  }

  for (const raw of txt.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    if (m[1] === 'EXPECTED_SUPABASE_REF') continue; // shell-only; see header
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[m[1]] = val;
  }
}

export interface ScriptClientOptions {
  /** The script's own name, for log attribution (e.g. 'sync-gauge-thresholds'). */
  script: string;
  /**
   * Whether this invocation will MUTATE the database. Dry-run scripts pass
   * their computed apply flag: false costs nothing extra, true requires the
   * EXPECTED_SUPABASE_REF pin to be set and to match.
   */
  write: boolean;
}

/**
 * Resolve credentials, print the target, run the write guard, and return a
 * service-role client. Throws (with the operator-facing remedy in the message)
 * instead of returning when the environment is unusable or unconfirmed —
 * scripts run under tsx, so an uncaught throw is a non-zero exit before any
 * connection exists.
 */
export function getScriptClient(opts: ScriptClientOptions): SupabaseClient {
  loadEnvLocal();

  const target = resolveSupabaseAdmin(process.env);
  if (!target.ok) {
    throw new Error(`[${opts.script}] ${target.message} (checked .env.local + shell env)`);
  }

  if (target.legacyNames.length > 0) {
    console.warn(
      `[${opts.script}] note: credentials resolved via legacy name(s) ` +
        `${target.legacyNames.join(', ')} — prefer NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.`,
    );
  }

  console.log(
    `[${opts.script}] → target Supabase project: ${target.ref ?? '(unknown)'}` +
      (opts.write ? ' (WRITE)' : ' (read)'),
  );

  if (opts.write) {
    const verdict = checkWriteTarget(target.ref, process.env.EXPECTED_SUPABASE_REF);
    if (!verdict.ok) {
      throw new Error(`[${opts.script}] ${verdict.message}`);
    }
  }

  return createClient(target.url, target.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
