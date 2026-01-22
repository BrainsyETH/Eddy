// src/middleware.ts
// Next.js middleware for Supabase auth session management
// TEMPORARILY SIMPLIFIED FOR DEBUGGING - restore from .backup if needed

import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  // Log the request for debugging (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log('Middleware hit:', request.nextUrl.pathname);
  }

  try {
    return await updateSession(request);
  } catch (error) {
    // If middleware fails, still allow the request through
    console.error('Middleware error:', error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    // Match all paths except static files, API routes, and image files
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
