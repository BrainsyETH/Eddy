// src/app/api/admin/activity/route.ts
// GET /api/admin/activity - List admin activity log entries with pagination

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const entityType = searchParams.get('entity_type');
    const action = searchParams.get('action');

    const offset = (page - 1) * limit;

    const supabase = createAdminClient();

    // Build query
    let query = supabase
      .from('admin_activity_log')
      .select('id, action, entity_type, entity_id, entity_name, details, created_at', { count: 'exact' });

    if (entityType) {
      query = query.eq('entity_type', entityType);
    }

    if (action) {
      query = query.eq('action', action);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: entries, error, count } = await query;

    if (error) {
      console.error('Error fetching activity log:', error);
      return NextResponse.json(
        { error: 'Could not fetch activity log' },
        { status: 500 }
      );
    }

    // Format response with camelCase fields
    const formatted = (entries || []).map((entry) => ({
      id: entry.id,
      action: entry.action,
      entityType: entry.entity_type,
      entityId: entry.entity_id,
      entityName: entry.entity_name,
      details: entry.details,
      createdAt: entry.created_at,
    }));

    return NextResponse.json({
      entries: formatted,
      total: count ?? 0,
      page,
      limit,
    });
  } catch (error) {
    console.error('Error in admin activity log endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
