// src/lib/env.ts
//
// The one place the environment is described.
//
// This repo runs on ~70 env vars across two very different consumers: the
// deployed Next.js app (Vercel injects everything, and a missing var surfaces
// as a cron that silently 401s or a feature that half-works) and operator
// scripts under scripts/ (each of which historically hand-rolled its own
// .env.local parsing and its own idea of which variable names to accept).
// Both failure modes trace back to the same gap: nothing in the codebase says
// what the environment is SUPPOSED to look like.
//
// Three things live here, all pure and dependency-free so every runtime —
// Next server, edge, tsx scripts, the node:test suite — can import them:
//
//   1. resolveSupabaseAdmin() — the single resolver for admin credentials.
//      Two naming conventions exist in the wild (NEXT_PUBLIC_SUPABASE_URL +
//      SUPABASE_SERVICE_ROLE_KEY is canonical; SUPABASE_URL + SUPABASE_KEY is
//      the legacy script dialect). This resolver accepts both and REPORTS when
//      the legacy names were the ones that resolved, so callers can steer
//      operators to one convention instead of forking the logic per script.
//
//   2. checkWriteTarget() — the write guard. A mutating connection must name
//      its target: EXPECTED_SUPABASE_REF has to be set and has to match the
//      project ref in the URL. This codifies the guardrail added after the
//      2026-07 prod/legacy project mixup (see import-usgs-gauges.ts), which
//      until now only four scripts honored — and even for those it was
//      optional. scripts/lib/db.ts is the intended caller.
//
//   3. auditEnv() — the boot-time report. CORE_ENV is the short list whose
//      absence means the deployment is broken by definition; FEATURE_ENV
//      groups vars that only work as a set, so a half-configured integration
//      (token present, page id missing) is caught at boot instead of at the
//      moment the cron that needs it fires. Instrumentation runs this once per
//      server process; see src/instrumentation.ts.
//
// Scope discipline: single optional vars (ANTHROPIC_API_KEY, SENTRY_DSN,
// OPENWEATHER_API_KEY, …) are deliberately NOT listed. Their absence means
// "feature off", which is a valid configuration, and a singleton cannot be
// partially configured. Only add a var here if its absence breaks the core
// deployment or its group is broken when incomplete.

export type Env = Record<string, string | undefined>;

/**
 * Extract the Supabase project ref from a project URL
 * (https://<ref>.supabase.co → <ref>). Returns null when the URL does not
 * look like a Supabase project URL — callers treat that as "unknown target",
 * which the write guard refuses.
 */
export function projectRefFromUrl(url: string): string | null {
  // Any *.supabase.* host counts, matching the guard this generalizes
  // (import-usgs-gauges.ts) — hosted projects are .co today but have moved
  // TLDs before, and a false null here blocks writes outright.
  const m = url.match(/^https?:\/\/([a-z0-9]+)\.supabase\./);
  return m ? m[1] : null;
}

export interface SupabaseAdminTarget {
  ok: true;
  url: string;
  serviceRoleKey: string;
  /** Project ref parsed from the URL, or null when unparseable. */
  ref: string | null;
  /** Legacy names that actually resolved, e.g. ['SUPABASE_URL']. Empty when
   *  the canonical convention supplied both values. */
  legacyNames: string[];
}

export interface SupabaseAdminMissing {
  ok: false;
  /** Human-oriented: which of the two values could not be resolved. */
  missing: ('url' | 'serviceRoleKey')[];
  message: string;
}

/**
 * Resolve admin (service-role) Supabase credentials from the environment,
 * accepting both the canonical and the legacy naming convention. Pass the env
 * explicitly (usually process.env) — taking it as a parameter is what makes
 * this testable and keeps scripts able to resolve against a snapshot.
 */
export function resolveSupabaseAdmin(env: Env): SupabaseAdminTarget | SupabaseAdminMissing {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;

  if (!url || !serviceRoleKey) {
    const missing: ('url' | 'serviceRoleKey')[] = [];
    if (!url) missing.push('url');
    if (!serviceRoleKey) missing.push('serviceRoleKey');
    return {
      ok: false,
      missing,
      message:
        'Missing NEXT_PUBLIC_SUPABASE_URL (or legacy SUPABASE_URL) and/or ' +
        'SUPABASE_SERVICE_ROLE_KEY (or legacy SUPABASE_KEY = service_role key) — ' +
        'checked the provided environment.',
    };
  }

  const legacyNames: string[] = [];
  if (!env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_URL) legacyNames.push('SUPABASE_URL');
  if (!env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_KEY) legacyNames.push('SUPABASE_KEY');

  return { ok: true, url, serviceRoleKey, ref: projectRefFromUrl(url), legacyNames };
}

export type WriteTargetVerdict =
  | { ok: true; ref: string }
  | { ok: false; reason: 'unknown-ref' | 'unpinned' | 'mismatch'; message: string };

/**
 * The write guard: may this environment open a MUTATING connection to the
 * resolved Supabase project?
 *
 * Three refusals, each with a copy-paste remedy in the message:
 *   unknown-ref — the URL does not parse as a Supabase project, so the target
 *                 cannot be named, so it cannot be confirmed.
 *   unpinned    — EXPECTED_SUPABASE_REF is not set. This is the deliberate
 *                 behavior change from the old convention (where the pin was
 *                 optional): a write now requires the operator to name the
 *                 target once per shell. The message includes the exact export
 *                 line for the project currently resolved, so proceeding —
 *                 after reading which project that is — costs one paste.
 *   mismatch    — the pin names a different project. The classic mixup this
 *                 guard exists for; never proceed.
 *
 * The pin must come from the live shell, not .env.local — a pin stored next
 * to the credentials it is supposed to confirm is a rubber stamp, not a
 * confirmation. scripts/lib/db.ts enforces that by refusing to load
 * EXPECTED_SUPABASE_REF from the file.
 */
export function checkWriteTarget(ref: string | null, expectedRef: string | undefined): WriteTargetVerdict {
  if (!ref) {
    return {
      ok: false,
      reason: 'unknown-ref',
      message:
        'ABORT: the resolved Supabase URL does not look like a project URL, so the ' +
        'target project cannot be confirmed. Fix NEXT_PUBLIC_SUPABASE_URL before writing.',
    };
  }
  if (!expectedRef) {
    return {
      ok: false,
      reason: 'unpinned',
      message:
        `ABORT: writes require naming the target project.\n` +
        `  This environment resolves to Supabase project '${ref}'.\n` +
        `  Confirm that is the database you intend to MUTATE, then pin it for this shell:\n` +
        `    export EXPECTED_SUPABASE_REF=${ref}\n` +
        `  and re-run. (The pin is read from the shell only — putting it in .env.local\n` +
        `  does not count as confirmation.)`,
    };
  }
  if (ref !== expectedRef) {
    return {
      ok: false,
      reason: 'mismatch',
      message:
        `ABORT: connected project '${ref}' != EXPECTED_SUPABASE_REF '${expectedRef}'. ` +
        `Point NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL at the intended project (or fix the pin) before writing.`,
    };
  }
  return { ok: true, ref };
}

// ─── Boot audit ──────────────────────────────────────────────────────────────

/**
 * Vars whose absence means the deployed app is broken by definition — not
 * "a feature is off" but "reads fail / crons silently 401". Kept deliberately
 * short: everything here hard-fails a production boot, so a var only belongs
 * on this list if shipping without it is strictly worse than refusing to ship.
 */
export const CORE_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  // Without this every /api/cron/* rejects the scheduler with a 401 and the
  // whole data pipeline stops — silently, which is the worst version.
  'CRON_SECRET',
] as const;

/**
 * Vars that should be present in production but whose absence degrades rather
 * than breaks. Missing → warn at boot, never fail.
 */
export const RECOMMENDED_ENV = [
  'NEXT_PUBLIC_SITE_URL',
  // At least one admin secret; see anyOf handling in auditEnv.
] as const;

/** At-least-one-of sets: satisfied when any member is present. */
export const CORE_ANY_OF: readonly (readonly string[])[] = [
  // Admin auth falls back ADMIN_API_SECRET || ADMIN_PASSWORD (admin-auth.ts).
  // Neither set = no admin surface and a console error per request.
  ['ADMIN_API_SECRET', 'ADMIN_PASSWORD'],
];

/**
 * Integrations that only work as a complete set. The audit flags a group when
 * it is PARTIALLY configured — some members present, some missing — because
 * that is never "feature off"; it is a misconfiguration that will fail at the
 * moment the feature fires (usually inside a cron, where nobody is watching).
 * A fully absent group is a valid "feature off" state and is never flagged.
 *
 * Getting a grouping slightly wrong costs a warning line at boot, not an
 * outage — the audit never hard-fails on feature groups.
 */
export const FEATURE_ENV: Record<string, readonly string[]> = {
  'meta-posting': ['META_PAGE_ACCESS_TOKEN', 'META_PAGE_ID', 'META_INSTAGRAM_ACCOUNT_ID'],
  tiktok: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
  'upstash-rate-limit': ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
  'apple-sign-in': ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY', 'APPLE_CLIENT_ID'],
  'gh-workflow-dispatch': ['GH_ACTIONS_TOKEN', 'GH_REPO_OWNER', 'GH_REPO_NAME'],
  'x402-payments': ['CDP_API_KEY_ID', 'CDP_API_KEY_SECRET'],
};

export interface PartialFeature {
  feature: string;
  present: string[];
  missing: string[];
}

export interface EnvAudit {
  /** CORE_ENV members that are absent. Non-empty ⇒ the deployment is broken. */
  missingCore: string[];
  /** CORE_ANY_OF sets with no member present, rendered as "A or B". */
  missingAnyOf: string[];
  /** RECOMMENDED_ENV members that are absent. Warn only. */
  missingRecommended: string[];
  /** FEATURE_ENV groups that are partially configured. Warn only. */
  partialFeatures: PartialFeature[];
}

export function auditEnv(env: Env): EnvAudit {
  const has = (name: string) => Boolean(env[name] && env[name] !== '');

  const missingCore = CORE_ENV.filter((name) => !has(name));
  const missingAnyOf = CORE_ANY_OF.filter((set) => !set.some(has)).map((set) => set.join(' or '));
  const missingRecommended = RECOMMENDED_ENV.filter((name) => !has(name));

  const partialFeatures: PartialFeature[] = [];
  for (const [feature, members] of Object.entries(FEATURE_ENV)) {
    const present = members.filter(has);
    if (present.length > 0 && present.length < members.length) {
      partialFeatures.push({
        feature,
        present,
        missing: members.filter((name) => !has(name)),
      });
    }
  }

  return { missingCore, missingAnyOf, missingRecommended, partialFeatures };
}

/** Render an audit as log lines. Empty array = nothing to report. */
export function formatEnvAudit(audit: EnvAudit): string[] {
  const lines: string[] = [];
  for (const name of audit.missingCore) {
    lines.push(`env: MISSING CORE ${name} — the deployment cannot function without it`);
  }
  for (const set of audit.missingAnyOf) {
    lines.push(`env: missing ${set} — the admin surface is unusable without one of them`);
  }
  for (const name of audit.missingRecommended) {
    lines.push(`env: missing ${name} (recommended)`);
  }
  for (const p of audit.partialFeatures) {
    lines.push(
      `env: feature '${p.feature}' is PARTIALLY configured — has ${p.present.join(', ')} ` +
        `but is missing ${p.missing.join(', ')}; it will fail when it fires`,
    );
  }
  return lines;
}
