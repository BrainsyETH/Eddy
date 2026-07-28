// src/app/api/me/alerts/route.ts
// GET /api/me/alerts — every rule the caller has, from both tables, as one list.
//
// The app's manage screen reads exactly this. Merging server-side rather than
// having the client call two endpoints is not just convenience: the two tables
// have different shapes, different pause semantics and different id spaces, and
// a client that stitched them itself would have to reimplement that mapping in
// every place it listed, sorted or paused a rule.
//
// Both reads are INDEPENDENT. One failing degrades the list rather than
// emptying it — a broken gauge query must not make someone's river alerts look
// deleted, which is the kind of thing that gets an alert re-created twice.

import { NextRequest, NextResponse } from 'next/server';
import { jsonPrivate } from '@/lib/api-utils';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser } from '@/lib/supabase/request';
import {
  GAUGE_ALERT_SELECT,
  RIVER_ALERT_SELECT,
  sortRules,
  toGaugeRule,
  toRiverRule,
  type GaugeAlertRow,
  type RiverAlertRow,
} from '@/lib/alerts/rule-serialize';
import type { AlertRule, AlertRulesResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    // Read whenever the Alerts tab opens. Keyed on the USER, never the IP:
    // carrier NAT collapses thousands of mobile subscribers into one bucket.
    const limited = await rateLimit(`me-alerts-read:${user.id}`, 120, 15 * 60 * 1000);
    if (limited) return limited;

    const [riverResult, gaugeResult] = await Promise.all([
      supabase
        .from('alert_subscriptions')
        .select(RIVER_ALERT_SELECT)
        .eq('user_id', user.id),
      supabase
        .from('gauge_alert_subscriptions')
        .select(GAUGE_ALERT_SELECT)
        .eq('user_id', user.id),
    ]);

    const rules: AlertRule[] = [];
    let partial = false;

    if (riverResult.error) {
      console.error('Error listing river alerts:', riverResult.error);
      partial = true;
    } else {
      rules.push(...((riverResult.data ?? []) as unknown as RiverAlertRow[]).map(toRiverRule));
    }

    if (gaugeResult.error) {
      console.error('Error listing gauge alerts:', gaugeResult.error);
      partial = true;
    } else {
      rules.push(...((gaugeResult.data ?? []) as unknown as GaugeAlertRow[]).map(toGaugeRule));
    }

    if (partial && rules.length === 0) {
      return jsonPrivate({ error: 'Could not load alerts' }, { status: 500 });
    }

    const response: AlertRulesResponse & { partial?: boolean } = { rules: sortRules(rules) };
    // Told, not hidden. A client that showed a short list as complete would
    // invite the user to re-create an alert they already have.
    if (partial) response.partial = true;

    return jsonPrivate(response);
  } catch (error) {
    console.error('Error listing alerts:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}
