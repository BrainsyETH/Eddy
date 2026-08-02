// src/app/api/services/route.ts
// GET /api/services — every outfitter, campground and shuttle Eddy lists that
// can actually be put on a map.
//
// ── Why this exists next to /api/rivers/[slug]/services ────────────────────
//
// That route answers "who serves THIS river" and returns the full directory
// record — booking platform, site counts, fee range, season, NPS campgrounds
// pulled in through access points. It is what the river screen renders, and it
// is the right shape for a page about one river.
//
// The map wants the opposite: every service in the state, and almost none of
// the fields. It draws a pin, and the callout behind it holds a name, a type, a
// town and a phone number. Fetching the per-river directory once per river to
// assemble that would be 25 requests for a layer of pins.
//
// ── Why not in the offline bundle ──────────────────────────────────────────
//
// Because the bundle says so, and its reasoning holds: services are "a
// commercial listing rather than something you navigate or avoid", so they earn
// no place in a payload whose job is to keep a phone useful in a canyon. A
// campground you cannot reach is an inconvenience; a low-water dam you cannot
// see is not. See src/lib/offline/bundle.ts.
//
// ── Placed only, and that is most of the story ─────────────────────────────
//
// 129 of 154 services have no coordinates. They are not omitted here as a
// judgement about them — they are simply not drawable, and a map layer whose
// rows have no position would be a promise the pins cannot keep. They remain in
// full on the river screen, which is a list and does not need a geocode. The
// number worth moving is the 129, and that is a data job, not this route's.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { toNum } from '@/lib/utils/num';

export const dynamic = 'force-dynamic';

/**
 * Declared here rather than imported from @eddy/types, which is where the app
 * reads the identical shape.
 *
 * Vercel's root directory is missouri-float-planner/, so shippable web code
 * cannot import from packages/ — see CLAUDE.md. The two definitions are checked
 * against each other by the app's own typecheck the moment this response is
 * parsed into a RiverService.
 */
interface MappedService {
  id: string;
  name: string;
  type: string;
  phone: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  servicesOffered: string[];
}

interface ServicesResponse {
  services: MappedService[];
}

/**
 * Ten minutes at the edge, a day of stale-while-revalidate.
 *
 * The directory changes when somebody edits it in the admin, which is to say
 * rarely and never urgently — an outfitter's phone number reaching a phone ten
 * minutes late has cost nobody anything.
 */
const S_MAXAGE = 600;
const STALE_WHILE_REVALIDATE = 86400;

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(`services-all:${getClientIp(request)}`, 60, 60 * 1000);
    if (limited) return limited;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('nearby_services')
      .select(
        'id, name, type, phone, website, city, state, latitude, longitude, description, services_offered',
      )
      .eq('status', 'active')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('display_order', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('[services] Error listing services:', error);
      return NextResponse.json({ error: 'Could not fetch services' }, { status: 500 });
    }

    const response: ServicesResponse = {
      services: (data ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        phone: s.phone ?? null,
        website: s.website ?? null,
        city: s.city ?? null,
        state: s.state ?? null,
        // numeric(9,6) arrives as a string over PostgREST, and a string
        // longitude reaches a map as NaN rather than as an error.
        latitude: toNum(s.latitude),
        longitude: toNum(s.longitude),
        description: s.description ?? null,
        servicesOffered: s.services_offered ?? [],
      })),
    };

    return NextResponse.json(response, {
      headers: cdnCacheHeaders(S_MAXAGE, STALE_WHILE_REVALIDATE),
    });
  } catch (error) {
    console.error('[services] Error listing services:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
