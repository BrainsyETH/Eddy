// src/lib/supabase/admin.ts
// Service role Supabase client for admin operations and cron jobs
// WARNING: This bypasses RLS - use only in server-side code

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Use untyped client for admin operations to avoid strict type issues
// In production, you should regenerate types after running migrations
export function createAdminClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase admin credentials');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
