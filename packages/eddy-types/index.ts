// packages/eddy-types/index.ts
// Shared API contracts between the Next.js backend and the Expo app.
//
// WHY THIS EXISTS: this project has already been bitten by the same concept
// being implemented more than once and drifting apart (four separate condition
// ladders, two flood-stage overrides). The iOS app is a client of this exact
// backend, so its contracts belong in one place that both sides import.
//
// HOW IT'S WIRED (deliberately NOT an npm workspace): Vercel builds with Root
// Directory = missouri-float-planner/, and converting the repo root to a
// workspace changes how installs resolve there — a real risk to a live deploy.
// Instead the Expo app reaches this directory via Metro `watchFolders` plus a
// tsconfig path alias. Vercel never sees it; the web app keeps building exactly
// as before.
//
// The backend's src/types/api.ts remains authoritative for web-only shapes.
// Move a type here only when BOTH sides use it.

// ── Conditions ───────────────────────────────────────────────────
// NOT redefined here. The canonical condition system lives in
// missouri-float-planner/shared/condition-system.ts, which owns the codes, the
// colours, the labels and BOTH severity orderings, and which states outright
// that nothing else may hardcode condition values.
//
// This file re-exports the type so the API shapes below can reference it
// without a second definition. Anything needing colours, labels or ordering
// should import from shared/condition-system directly:
//   CONDITION_SYSTEM  — colours + labels (never hardcode hex)
//   FLOATABLE_NOW     — the strict flowing/good bucket public counts use
//   WEEKEND_SEVERITY   — floatable-first ordering for "where can I go"
//
// An earlier version of this file duplicated a severity map and a floatable
// helper. Both already existed there, and WEEKEND_SEVERITY had itself already
// been consolidated out of four copies — so the duplicates were re-creating a
// problem someone had explicitly fixed.

export type { ConditionCode } from '../../missouri-float-planner/shared/condition-system';
import type { ConditionCode } from '../../missouri-float-planner/shared/condition-system';

// ── Rivers ───────────────────────────────────────────────────────

export interface River {
  id: string;
  name: string;
  slug: string;
  lengthMiles: number;
  description: string | null;
  difficultyRating: string | null;
  region: string | null;
}

export interface RiverListItem extends River {
  accessPointCount: number;
  /** rivers.state code, e.g. 'MO' */
  state: string;
  /** rivers.river_type — hydrological archetype, e.g. 'spring_fed_float' */
  riverType: string | null;
  /** Canonical page path, e.g. /rivers/missouri/current */
  path: string;
  currentCondition: {
    label: string;
    code: ConditionCode;
  } | null;
}

export interface RiversResponse {
  rivers: RiverListItem[];
}

// ── Alert events (the outbox the app's Alerts tab reads) ─────────

export type EventKind = 'floatable' | 'warning' | 'easing' | 'recovery' | 'info';

export interface RiverConditionEvent {
  id: string;
  riverId: string;
  oldConditionCode: ConditionCode;
  newConditionCode: ConditionCode;
  kind: EventKind;
  /** Quote this in UI copy, never detectedAt — see the latency note below. */
  readingAt: string | null;
  detectedAt: string;
}

/**
 * USGS reporting lag plus the cron cadence means an alert lands roughly 20–75
 * minutes after the real transition. Copy must say "first to know", never
 * "instantly", and should surface `readingAt` rather than `detectedAt`.
 */
export const ALERT_LATENCY_NOTE = 'Conditions are checked regularly; readings can lag the river by up to about an hour.';

// ── Consumer account endpoints (/api/me/*) ───────────────────────

export interface MeEntitlement {
  entitlementId: string;
  /** Derived server-side from expires_at; never trust a client clock. */
  isActive: boolean;
  expiresAt: string | null;
  willRenew: boolean | null;
  productId: string | null;
  billingIssue: boolean;
}

export interface MeProfile {
  id: string;
  displayName: string | null;
  homeRegion: string | null;
  createdAt: string;
}

export interface MeProfileResponse {
  profile: MeProfile;
  isAnonymous: boolean;
  entitlement: MeEntitlement | null;
}

export interface StarredRiverEntry {
  riverId: string;
  riverName: string;
  riverSlug: string;
  starredAt: string;
}

export interface StarredRiversResponse {
  starred: StarredRiverEntry[];
}

export type AlertSubscriptionKind = 'floatable' | 'safety' | 'all';

export interface AlertSubscriptionEntry {
  id: string;
  riverId: string;
  riverName: string;
  riverSlug: string;
  kind: AlertSubscriptionKind;
  oneShot: boolean;
  firedAt: string | null;
  createdAt: string;
}

export interface AlertSubscriptionsResponse {
  subscriptions: AlertSubscriptionEntry[];
}

// ── Remote config / kill switches (GET /api/app-config) ──────────

export interface AppFeatureFlags {
  push: boolean;
  offlineDownloads: boolean;
  planner: boolean;
  chat: boolean;
}

export interface AppConfigResponse {
  /** Builds below this must refuse to run and prompt for an upgrade. */
  minSupportedVersion: string;
  latestVersion: string;
  upgradeMessage: string | null;
  features: AppFeatureFlags;
  minRefreshSeconds: number;
  notice: string | null;
}

/**
 * Compares dotted numeric versions. Returns <0, 0, >0 like a sort comparator.
 *
 * Missing segments count as 0, so "1.2" === "1.2.0". Non-numeric segments are
 * treated as 0 rather than NaN: a malformed version must not silently compare
 * as "newer than everything" and let an unsupported build through.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    String(v ?? '')
      .split('.')
      .map((part) => {
        const n = parseInt(part, 10);
        return Number.isFinite(n) ? n : 0;
      });

  const left = parse(a);
  const right = parse(b);
  const len = Math.max(left.length, right.length);

  for (let i = 0; i < len; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * Whether this build is below the server's supported floor.
 *
 * Fails OPEN: if either version is missing we return false (allow the app to
 * run). Locking someone out because config was unreadable is far worse than
 * briefly letting an old build through — and /api/app-config already serves
 * permissive defaults for the same reason.
 */
export function isUpgradeRequired(
  currentVersion: string | null | undefined,
  minSupportedVersion: string | null | undefined,
): boolean {
  if (!currentVersion || !minSupportedVersion) return false;
  return compareVersions(currentVersion, minSupportedVersion) < 0;
}
