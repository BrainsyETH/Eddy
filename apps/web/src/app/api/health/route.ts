// src/app/api/health/route.ts
// Health check endpoint for debugging production issues

import { NextResponse } from 'next/server';

export async function GET() {
  const envCheck = {
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasMapboxToken: !!process.env.MAPBOX_ACCESS_TOKEN,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  };

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: envCheck,
  });
}
