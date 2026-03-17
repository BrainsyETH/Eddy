// src/app/api/rivers/route.ts
// GET /api/rivers - List all rivers

import { NextResponse } from 'next/server';
import { getRivers } from '@/lib/data/rivers';
import type { RiversResponse } from '@/types/api';

// Force dynamic rendering (API route)
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
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
