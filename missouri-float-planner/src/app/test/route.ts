// src/app/test/route.ts
// Simple test endpoint to verify routing works

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Routing is working!',
    timestamp: new Date().toISOString(),
    path: '/test',
  });
}
