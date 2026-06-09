// src/app/api/rivers/route.ts
// GET /api/rivers - List all rivers

import { NextRequest, NextResponse } from 'next/server';
import { getRivers } from '@/lib/data/rivers';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { withX402Route } from '@/lib/x402-config';
import type { RiversResponse } from '@/types/api';

// Force dynamic rendering (API route)
export const dynamic = 'force-dynamic';

async function _GET(request: NextRequest) {
  try {
    // Rate limit: 60 requests per IP per minute
    const rateLimitResult = rateLimit(`rivers:${getClientIp(request)}`, 60, 60 * 1000);
    if (rateLimitResult) return rateLimitResult;

    const rivers = await getRivers();

    const response: RiversResponse = { rivers };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in rivers endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withX402Route(_GET, '$0.005', 'River data access');
