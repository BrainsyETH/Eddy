import { NextRequest, NextResponse } from 'next/server';
import { jsonPrivate } from '@/lib/api-utils';
import { requirePermanentUser } from '@/lib/supabase/request';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rate-limit';
import { waterAtStart } from '@/lib/float-archive/water';
import type { CompletedFloat } from '@shared/float-archive';
import { archiveBatch } from '@/lib/float-archive/validation';

export const dynamic = 'force-dynamic';
async function authorize(request: NextRequest) {
  const auth = await requirePermanentUser(request);
  if (auth instanceof NextResponse) return auth;
  const limited = await rateLimit(`float-archive:${auth.user.id}`, 240, 15 * 60 * 1000);
  return limited ?? auth;
}
export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth instanceof NextResponse) return auth;
    const cursor = request.nextUrl.searchParams.get('cursor');
    let query = auth.supabase
      .from('float_archive')
      .select('id,kind,payload,deleted,consent_version')
      .eq('user_id', auth.user.id)
      .order('id')
      .limit(200);
    if (cursor) query = query.gt('id', cursor);
    const [{ data, error }, preference] = await Promise.all([
      query,
      auth.supabase
        .from('float_archive_preferences')
        .select('enabled,consent_version')
        .eq('user_id', auth.user.id)
        .maybeSingle(),
    ]);
    if (error || preference.error) throw new Error('Archive unavailable');
    return jsonPrivate({
      rows: (data ?? []).map((row) => ({
        id: row.id,
        kind: row.kind,
        payload: row.payload,
        deleted: row.deleted,
        contributionVersion: row.consent_version,
      })),
      nextCursor: data?.length === 200 ? data[data.length - 1].id : null,
      preference: { enabled: preference.data?.enabled ?? false, version: preference.data?.consent_version ?? null },
    });
  } catch {
    return jsonPrivate({ error: 'Could not load float backup. Please retry.' }, { status: 503 });
  }
}
export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth instanceof NextResponse) return auth;
    const raw = await request.text();
    if (raw.length > 100000) return jsonPrivate({ error: 'Batch too large' }, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return jsonPrivate({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = archiveBatch.safeParse(body);
    if (!parsed.success) return jsonPrivate({ error: 'Invalid float summary' }, { status: 400 });
    const admin = createAdminClient(AbortSignal.timeout(12000));
    const rows = await Promise.all(
      parsed.data.rows.map(async (row) =>
        row.kind === 'completed' && !row.deleted
          ? {
              ...row,
              payload: {
                ...(row.payload as CompletedFloat),
                water: await waterAtStart(admin, row.payload as CompletedFloat),
              },
            }
          : row,
      ),
    );
    const { error } = await createAdminClient().rpc('write_float_archive', { p_user: auth.user.id, p_rows: rows });
    if (error) throw new Error('Archive write failed');
    return jsonPrivate({ ok: true });
  } catch {
    return jsonPrivate({ error: 'Could not back up floats. Please retry.' }, { status: 503 });
  }
}
export async function PATCH(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth instanceof NextResponse) return auth;
    const body = await request.json().catch(() => null);
    if (typeof body?.enabled !== 'boolean') return jsonPrivate({ error: 'Choose on or off' }, { status: 400 });
    const { data, error } = await createAdminClient().rpc('set_float_contribution', {
      p_user: auth.user.id,
      p_enabled: body.enabled,
    });
    if (error) throw new Error('Preference unavailable');
    return jsonPrivate(data);
  } catch {
    return jsonPrivate({ error: 'Could not update sharing. Reconnect and retry.' }, { status: 503 });
  }
}
