// src/app/api/vessel-types/route.ts
// GET /api/vessel-types - Get available vessel types

import { NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createClient } from '@/lib/supabase/server';
import type { VesselTypesResponse } from '@/types/api';
import { withX402Route } from '@/lib/x402-config';

// Force dynamic rendering (uses cookies for Supabase)
export const dynamic = 'force-dynamic';

async function _GET() {
  try {
    const supabase = await createClient();

    const { data: vesselTypes, error } = await supabase
      .from('vessel_types')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching vessel types:', error);
      return NextResponse.json(
        { error: 'Could not fetch vessel types' },
        { status: 500 }
      );
    }

    const formattedTypes = (vesselTypes || []).map((vt) => ({
      id: vt.id,
      name: vt.name,
      slug: vt.slug,
      description: vt.description || '',
      icon: vt.icon || '',
      speeds: {
        lowWater: vt.speed_low_water != null ? parseFloat(String(vt.speed_low_water)) : 0,
        normal: vt.speed_normal != null ? parseFloat(String(vt.speed_normal)) : 0,
        highWater: vt.speed_high_water != null ? parseFloat(String(vt.speed_high_water)) : 0,
      },
    }));

    const response: VesselTypesResponse = {
      vesselTypes: formattedTypes,
    };

    return NextResponse.json(response, { headers: cdnCacheHeaders(3600, 86400) });
  } catch (error) {
    console.error('Error in vessel types endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withX402Route(_GET, '/api/vessel-types');
