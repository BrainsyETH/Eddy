// src/app/api/admin/social/post-blog/route.ts
// POST — manually publish the next weekly blog spotlight to Facebook. Lets an
// admin test the flow without waiting for Tuesday's cron. No same-day dedup here
// on purpose (so a test can force a post); the cron path handles dedup.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { publishBlogFeature } from '@/lib/social/blog-poster';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const result = await publishBlogFeature(supabase);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
