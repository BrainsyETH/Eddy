import { NextRequest, NextResponse } from 'next/server';
import { jsonPrivate } from '@/lib/api-utils';
import { requirePermanentUser } from '@/lib/supabase/request';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rate-limit';
import { archiveEnvelope } from '@/lib/float-archive/validation';
import { writeArchiveBatch } from '@/lib/float-archive/write';

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
    // Authenticated capability check avoids downloading history before a note-bearing upload.
    if (request.nextUrl.searchParams.get('capabilities') === '1')
      return jsonPrivate({ capabilities: { startNote: true } });
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
    const parsed = archiveEnvelope.safeParse(body);
    if (!parsed.success) return jsonPrivate({ error: 'Invalid backup request' }, { status: 400 });
    const admin = createAdminClient(AbortSignal.timeout(12000));
    const results = await writeArchiveBatch(admin, auth.user.id, parsed.data.rows);
    return jsonPrivate({ ok: true, results });
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
