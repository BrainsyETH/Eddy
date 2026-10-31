import { NextRequest, NextResponse } from 'next/server';
import { jsonPrivate } from '@/lib/api-utils';
import { requirePermanentUser } from '@/lib/supabase/request';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rate-limit';
import { archiveEnvelope } from '@/lib/float-archive/validation';
import { writeArchiveBatch } from '@/lib/float-archive/write';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
// Log the failing operation and database code, never trip payloads, notes,
// account IDs, tokens, or PostgREST details (which can include row contents).
function logFailure(method: string, stage: string, error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  logger.error('[float-archive] request failed', new Error(`Float backup ${method} failed`), {
    method, stage, code: typeof code === 'string' && /^[A-Z0-9]{5,12}$/.test(code) ? code : null,
  });
}
async function authorize(request: NextRequest) {
  const auth = await requirePermanentUser(request);
  if (auth instanceof NextResponse) return auth;
  const limited = await rateLimit(`float-archive:${auth.user.id}`, 240, 15 * 60 * 1000);
  return limited ?? auth;
}
export async function GET(request: NextRequest) {
  let stage = 'authorize';
  try {
    const auth = await authorize(request);
    if (auth instanceof NextResponse) return auth;
    // Authenticated capability check avoids downloading history before an
    // upload that carries a field older servers rejected: a start note, or
    // the recap context (start condition, river span, covered miles, weather).
    if (request.nextUrl.searchParams.get('capabilities') === '1')
      return jsonPrivate({ capabilities: { startNote: true, recapContext: true, recapRouteWeather: true } });
    stage = 'read-archive';
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
    if (error) throw error;
    if (preference.error) { stage = 'read-preference'; throw preference.error; }
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
  } catch (error) {
    logFailure('GET', stage, error);
    return jsonPrivate({ error: 'Could not load float backup. Please retry.' }, { status: 503 });
  }
}
export async function POST(request: NextRequest) {
  let stage = 'authorize';
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
    stage = 'create-admin-client';
    const admin = createAdminClient(AbortSignal.timeout(12000));
    stage = 'write-archive';
    const results = await writeArchiveBatch(admin, auth.user.id, parsed.data.rows);
    return jsonPrivate({ ok: true, results });
  } catch (error) {
    logFailure('POST', stage, error);
    return jsonPrivate({ error: 'Could not back up floats. Please retry.' }, { status: 503 });
  }
}
export async function PATCH(request: NextRequest) {
  let stage = 'authorize';
  try {
    const auth = await authorize(request);
    if (auth instanceof NextResponse) return auth;
    const body = await request.json().catch(() => null);
    if (typeof body?.enabled !== 'boolean') return jsonPrivate({ error: 'Choose on or off' }, { status: 400 });
    stage = 'create-admin-client';
    const admin = createAdminClient();
    stage = 'set-contribution';
    const { data, error } = await admin.rpc('set_float_contribution', {
      p_user: auth.user.id,
      p_enabled: body.enabled,
    });
    if (error) throw error;
    return jsonPrivate(data);
  } catch (error) {
    logFailure('PATCH', stage, error);
    return jsonPrivate({ error: 'Could not update sharing. Reconnect and retry.' }, { status: 503 });
  }
}
