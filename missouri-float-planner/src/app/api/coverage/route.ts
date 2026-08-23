// src/app/api/coverage/route.ts
// GET /api/coverage — what Eddy covers, as data rather than prose.
//
// Exists so that nothing outside this codebase has to hardcode a coverage
// number either. The iOS app, the embeddable widgets, an outfitter's own page
// and a competitive teardown can all read the same figures the website renders,
// and the vocabulary travels with them: each count ships beside the definition
// that produced it, because "gauges" means two different things here and a bare
// integer invites the reader to pick the flattering one.
//
// Cached for five minutes at the CDN. Coverage moves when a river is onboarded,
// so the window is about collapsing repeated hits, not about freshness.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { getCoverageCounts, getCuratedRivers, curatedStates } from '@/lib/coverage';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Shipped alongside the numbers, not kept in a doc that can drift from them.
 *
 * The definitions are the load-bearing half of this response: `ratedGauges: 44`
 * and `referenceGauges: 14218` describe genuinely different promises, and a
 * consumer that reads only the integers will eventually add them together and
 * publish the sum.
 */
const DEFINITIONS: Record<string, string> = {
  curatedRivers:
    'Rivers Eddy has researched: float-condition thresholds calibrated against outfitter and agency guidance, verified access points, hazards, float-time estimates and shuttle logistics. Eddy makes recommendations here.',
  ratedGauges:
    'Gauges on curated rivers carrying a floatability ladder, so they produce a recreational verdict ("Flowing — ideal") rather than only a number. A river may have several, one per reach.',
  referenceGauges:
    'Live USGS stations Eddy ingests nationwide with no float verdict attached. Eddy shows the measurement, its trend and the NWS forecast, and deliberately offers no recommendation, because nobody has researched what "good" means on that water.',
  accessPoints:
    'Put-ins and take-outs on curated rivers that a human has verified against an official source and approved for display.',
  hazards: 'Recorded hazards on curated rivers.',
  campgrounds:
    'NPS campgrounds synced from the National Park Service API, plus private campgrounds researched by Eddy.',
  services:
    'Outfitters, campgrounds and cabins or lodges near curated rivers. Businesses recorded as permanently closed are excluded.',
};

export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = await rateLimit(`coverage:${getClientIp(request)}`, 60, 60 * 1000);
    if (rateLimitResult) return rateLimitResult;

    const [counts, rivers] = await Promise.all([getCoverageCounts(), getCuratedRivers()]);

    return NextResponse.json(
      {
        counts,
        definitions: DEFINITIONS,
        curatedRivers: rivers,
        curatedStates: curatedStates(rivers),
        // Not a build constant: this is when the figures were READ from the
        // database, which is the only date a consumer can act on. A
        // "last updated" stamped at deploy time would keep looking fresh long
        // after the numbers behind it moved.
        generatedAt: new Date().toISOString(),
      },
      { headers: cdnCacheHeaders(300, 3600) },
    );
  } catch (error) {
    console.error('[api/coverage] failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
