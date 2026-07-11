// src/app/api/embed/impression/route.ts
// POST /api/embed/impression — beacon target for embed widget impressions.
//
// Widgets fire one sendBeacon per load (see EmbedImpression.tsx). The payload
// is reduced server-side to non-personal aggregates: the raw referrer is cut
// down to a hostname before it ever reaches the database, and everything else
// is allowlist/regex validated. Failures return 204 — an analytics hiccup
// must never surface inside a partner's embedded widget.

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const WIDGET_TYPES = new Set([
  'card',
  'widget',
  'eddy-quote',
  'planner',
  'services',
  'gauge-report',
  'badge',
  'river-day',
  'rivers',
]);

const KEY_RE = /^[a-z0-9_-]{1,60}$/;

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // 30/min per IP — a host page shows at most a handful of widgets.
    const limited = await rateLimit(`embed-imp:${getClientIp(request)}`, 30, 60 * 1000);
    if (limited) return limited;

    const body = await request.json().catch(() => null);

    const widgetType =
      typeof body?.widgetType === 'string' && WIDGET_TYPES.has(body.widgetType)
        ? body.widgetType
        : null;
    if (!widgetType) {
      return NextResponse.json({ error: 'invalid widgetType' }, { status: 400 });
    }

    const rawKey = typeof body?.widgetKey === 'string' ? body.widgetKey : '';
    const widgetKey = KEY_RE.test(rawKey) ? rawKey : 'none';

    // Reduce the referrer to a hostname; anything unparseable is 'direct'.
    let referrerHost = 'direct';
    if (typeof body?.referrer === 'string' && body.referrer) {
      try {
        referrerHost = new URL(body.referrer).hostname.slice(0, 100) || 'direct';
      } catch {
        // keep 'direct'
      }
    }

    const theme = body?.theme === 'dark' ? 'dark' : 'light';
    const partner =
      typeof body?.partner === 'string' && body.partner ? body.partner.slice(0, 60) : null;

    const supabase = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)('log_embed_impression', {
      p_widget_type: widgetType,
      p_widget_key: widgetKey,
      p_referrer_host: referrerHost,
      p_theme: theme,
      p_partner: partner,
    });
    if (error) console.error('[EmbedImpression] log failed:', error);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[EmbedImpression] unexpected error:', error);
    return new NextResponse(null, { status: 204 });
  }
}
