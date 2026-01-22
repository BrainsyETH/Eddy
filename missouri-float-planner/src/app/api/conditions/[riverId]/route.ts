// src/app/api/conditions/[riverId]/route.ts
// GET /api/conditions/[riverId] - Get current river conditions

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ConditionResponse } from '@/types/api';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ riverId: string }> }
) {
  try {
    const { riverId } = await params;
    const supabase = await createClient();

    // Call the database function to get river condition
    const { data, error } = await supabase.rpc('get_river_condition', {
      p_river_id: riverId,
    });

    if (error) {
      console.error('Error fetching river condition:', error);
      return NextResponse.json(
        { condition: null, available: false },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json<ConditionResponse>({
        condition: null,
        available: false,
      });
    }

    const condition = data[0];

    const response: ConditionResponse = {
      condition: {
        label: condition.condition_label || 'Unknown Conditions',
        code: condition.condition_code || 'unknown',
        gaugeHeightFt: condition.gauge_height_ft,
        dischargeCfs: condition.discharge_cfs,
        readingTimestamp: condition.reading_timestamp,
        readingAgeHours: condition.reading_age_hours,
        accuracyWarning: condition.accuracy_warning || false,
        accuracyWarningReason: condition.accuracy_warning_reason,
        gaugeName: condition.gauge_name,
        gaugeUsgsId: condition.gauge_usgs_id,
      },
      available: true,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Unexpected error in conditions endpoint:', error);
    return NextResponse.json(
      { condition: null, available: false },
      { status: 500 }
    );
  }
}
