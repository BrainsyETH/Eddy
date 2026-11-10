// src/app/api/admin/export/route.ts
// GET /api/admin/export - Export data as CSV or JSON

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth, logAdminAction } from '@/lib/admin-auth';
import { csvRow } from '@/lib/security/csv';

export const dynamic = 'force-dynamic';

const EXPORT_CONFIGS: Record<string, { table: string; columns: string }> = {
  access_points: {
    table: 'access_points',
    columns: 'id, name, slug, river_id, latitude, longitude, river_mile, type, description, amenities, approved, created_at, updated_at',
  },
  feedback: {
    table: 'feedback',
    columns: 'id, name, email, category, message, status, admin_notes, created_at, updated_at',
  },
  blog: {
    table: 'blog_posts',
    columns: 'id, slug, title, description, category, status, published_at, created_at, updated_at',
  },
  gauges: {
    table: 'gauge_stations',
    columns: 'id, site_id, name, river_id, latitude, longitude, url, created_at, updated_at',
  },
  pois: {
    table: 'points_of_interest',
    columns: 'id, name, river_id, latitude, longitude, river_mile, type, description, source, created_at, updated_at',
  },
};

// One export is a bounded download, not a table dump of unknown size.
const MAX_EXPORT_ROWS = 10_000;

const DOWNLOAD_HEADERS = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

export async function GET(request: NextRequest) {
  try {
    const authError = await requireAdminAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const format = searchParams.get('format') || 'json';

    // Validate type
    if (!type || !EXPORT_CONFIGS[type]) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${Object.keys(EXPORT_CONFIGS).join(', ')}` },
        { status: 400 }
      );
    }

    // Validate format
    if (format !== 'csv' && format !== 'json') {
      return NextResponse.json(
        { error: 'Invalid format. Must be csv or json' },
        { status: 400 }
      );
    }

    const config = EXPORT_CONFIGS[type];
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from(config.table)
      .select(config.columns)
      .order('created_at', { ascending: false })
      .limit(MAX_EXPORT_ROWS);

    if (error) {
      console.error(`Error exporting ${type}:`, error);
      return NextResponse.json(
        { error: `Could not export ${type}` },
        { status: 500 }
      );
    }

    const rows = data || [];

    // Exports can carry personal data (feedback includes names and emails), so
    // each one is recorded. Awaited so the record is not lost after the response.
    const audit = await logAdminAction({ request,
      action: 'export',
      entityType: type,
      details: { format, rows: rows.length, truncated: rows.length === MAX_EXPORT_ROWS },
    });
    if (!audit.ok) console.error('[AdminExport] audit log not written:', audit.error);
    const filename = `${type}_export_${new Date().toISOString().slice(0, 10)}`;

    if (format === 'csv') {
      // Build CSV
      const columns = config.columns.split(',').map((c) => c.trim());
      const headerRow = csvRow(columns);
      const dataRows = rows.map((row) =>
        csvRow(columns.map((col) => (row as unknown as Record<string, unknown>)[col]))
      );
      const csv = [headerRow, ...dataRows].join('\n');

      return new NextResponse(csv, {
        status: 200,
        headers: {
          ...DOWNLOAD_HEADERS,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}.csv"`,
        },
      });
    }

    // JSON format
    return new NextResponse(JSON.stringify(rows, null, 2), {
      status: 200,
      headers: {
        ...DOWNLOAD_HEADERS,
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}.json"`,
      },
    });
  } catch (error) {
    console.error('Error in admin export endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
