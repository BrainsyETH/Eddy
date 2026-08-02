// src/app/api/app-config/route.ts
// GET /api/app-config — remote configuration and kill switches for the app.
//
// WHY IT EXISTS: App Store review latency means a broken client can be live for
// days, and old builds persist in the wild for years. This is the only lever
// that reaches an already-installed app without shipping a binary through
// review — a version gate to retire builds that can no longer be supported, and
// per-feature switches to disable something misbehaving.
//
// The strategy chose this over a versioned /api/v1 namespace: a min-version
// gate plus additive-only API discipline is far cheaper than duplicating ~30
// routes, and a real /v1 can be reserved for the first genuinely breaking
// change.
//
// TWO PROPERTIES THIS ROUTE MUST KEEP:
//
//  1. It FAILS OPEN. If the row is missing or the database is unreachable, it
//     returns permissive defaults with 200. A config endpoint that 500s would
//     brick every client that treats a failed fetch as "do not start" — the
//     outage would be indistinguishable from a forced upgrade.
//
//  2. It stays PUBLIC and CDN-cacheable. Every app instance polls it, including
//     signed-out and pre-upgrade builds, so it must not require auth and must
//     not add per-request database load at scale.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cdnCacheHeaders } from '@/lib/api-utils';
import type { AppConfigResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

/**
 * Permissive fallback. Everything enabled, nothing gated — the safe direction
 * when we cannot read the real config.
 */
const FALLBACK: AppConfigResponse = {
  minSupportedVersion: '0.0.0',
  latestVersion: '0.1.0',
  upgradeMessage: null,
  features: {
    push: true,
    planner: true,
    chat: false,
  },
  minRefreshSeconds: 60,
  notice: null,
};

export async function GET() {
  // Short cache: long enough to absorb a push-driven thundering herd, short
  // enough that flipping a kill switch takes effect within a minute.
  const headers = cdnCacheHeaders(60, 300);

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('app_config')
      .select(
        // `offline_downloads_enabled` is deliberately absent: the offline map
        // download was removed, so the flag has no reader. The COLUMN is left
        // in place — dropping it needs a migration for no benefit, and a
        // rollback would want it back.
        'min_supported_version, latest_version, upgrade_message, push_enabled, planner_enabled, chat_enabled, min_refresh_seconds, notice'
      )
      .maybeSingle();

    if (error || !data) {
      // Deliberately 200 with defaults, not an error status. See property 1.
      console.warn('[app-config] Falling back to defaults:', error?.message ?? 'no row');
      return NextResponse.json(FALLBACK, { headers });
    }

    const response: AppConfigResponse = {
      minSupportedVersion: data.min_supported_version,
      latestVersion: data.latest_version,
      upgradeMessage: data.upgrade_message,
      features: {
        push: data.push_enabled,
        planner: data.planner_enabled,
        chat: data.chat_enabled,
      },
      minRefreshSeconds: data.min_refresh_seconds,
      notice: data.notice,
    };

    return NextResponse.json(response, { headers });
  } catch (err) {
    console.error('[app-config] Unexpected error, serving defaults:', err);
    return NextResponse.json(FALLBACK, { headers });
  }
}
