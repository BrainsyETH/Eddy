// src/app/api/admin/social/post-blog/route.ts
// POST — manually publish the next river guide to Facebook. Lets an
// admin use the flow outside the weekday morning slot. No same-day dedup here
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
