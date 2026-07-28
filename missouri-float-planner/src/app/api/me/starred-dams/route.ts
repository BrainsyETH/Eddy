// src/app/api/me/starred-dams/route.ts
// GET    /api/me/starred-dams         — list the caller's starred dams
// POST   /api/me/starred-dams         — star ({ damId })
// DELETE /api/me/starred-dams?damId=… — unstar
//
// The dam half of Favorites, and a mirror of starred-rivers (00181) and
// starred-gauges (00194): same local-first-with-the-server-as-a-replica model,
// same `requireUser` rather than `requirePermanentUser` — anonymous sessions are
// allowed BY DESIGN so a star survives the anonymous → Sign-in-with-Apple
// upgrade on the same uid, and so starring never costs a sign-up. Same fail-OPEN
// limiter, keyed on the user rather than the IP (carrier NAT collapses thousands
// of mobile subscribers into one bucket).
//
// ── The one real difference: this route IS the foreign key ──────────────────
// starred_rivers and starred_gauges hold real FKs, and their POST routes lean on
// them — a Postgres 23503 becomes a 404 rather than a row pointing at nothing.
// starred_dams cannot: dams are read through from USACE CWMS and SWPA rather
// than stored (see src/lib/data/dams.ts), so their identity is a slug in the
// registry, not a uuid in a table this database owns. Nine of the ten have no
// row here at all.
//
// So the existence check is explicit, against USACE_DAMS, BEFORE the insert.
// Same observable behaviour as the other two — 404 for an unknown parent — done
// where the parent actually lives. Migration 00206 has the longer version.

import { NextRequest, NextResponse } from 'next/server';
import { jsonPrivate } from '@/lib/api-utils';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser } from '@/lib/supabase/request';
import { USACE_DAMS, getUsaceDam } from '@/lib/flow-providers/usace-registry';
import type { StarredDamsResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    const limited = await rateLimit(`me-dam-stars-read:${user.id}`, 120, 15 * 60 * 1000);
    if (limited) return limited;

    const { data, error } = await supabase
      .from('starred_dams')
      .select('dam_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error listing starred dams:', error);
      return jsonPrivate({ error: 'Could not load starred dams' }, { status: 500 });
    }

    type StarredRow = { dam_id: string; created_at: string };
    const rows = (data ?? []) as unknown as StarredRow[];

    const response: StarredDamsResponse = {
      // A row whose dam has left the registry is DROPPED from the response
      // rather than returned nameless. 00206 keeps the row deliberately — a
      // code edit must not delete user data — but a star pointing at something
      // this build cannot describe has nothing to render and nowhere to go.
      starred: rows.flatMap((row) => {
        const dam = USACE_DAMS[row.dam_id];
        if (!dam) return [];
        return [
          {
            damId: row.dam_id,
            damName: dam.name,
            lakeName: dam.lakeName,
            riverSlug: dam.tailwater?.riverSlug ?? null,
            starredAt: row.created_at,
          },
        ];
      }),
    };

    return jsonPrivate(response);
  } catch (error) {
    console.error('Error listing starred dams:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    const limited = await rateLimit(`me-dam-stars-write:${user.id}`, 90, 15 * 60 * 1000);
    if (limited) return limited;

    const body = (await request.json().catch(() => null)) as { damId?: string } | null;
    if (!body?.damId) {
      return jsonPrivate({ error: 'damId required' }, { status: 400 });
    }

    // The FK the database cannot hold. Ahead of the insert so an unknown id is
    // a 404 rather than a stored row nothing can resolve.
    if (!getUsaceDam(body.damId)) {
      return jsonPrivate({ error: 'Dam not found' }, { status: 404 });
    }

    // Idempotent, and `ignoreDuplicates` is load-bearing rather than tidy:
    // mergeStars compares a local edit time against the server's created_at, so
    // a re-star that BUMPED that timestamp would let the server's copy win over
    // a newer local unstar. All three star kinds go through one merge function
    // and cannot afford to differ.
    const { error } = await supabase
      .from('starred_dams')
      .upsert(
        { user_id: user.id, dam_id: body.damId },
        { onConflict: 'user_id,dam_id', ignoreDuplicates: true },
      );

    if (error) {
      console.error('Error starring dam:', error);
      return jsonPrivate({ error: 'Could not star dam' }, { status: 500 });
    }

    return jsonPrivate({ ok: true, damId: body.damId });
  } catch (error) {
    console.error('Error starring dam:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    // Shares the write budget with POST — a toggle is both.
    const limited = await rateLimit(`me-dam-stars-write:${user.id}`, 90, 15 * 60 * 1000);
    if (limited) return limited;

    const damId = request.nextUrl.searchParams.get('damId');
    if (!damId) {
      return jsonPrivate({ error: 'damId required' }, { status: 400 });
    }

    // NOT validated against the registry, unlike POST. Turning a star OFF must
    // always work: a dam removed from the registry is exactly the case where
    // someone needs to be able to clear the row it left behind.
    const { error } = await supabase
      .from('starred_dams')
      .delete()
      .eq('user_id', user.id)
      .eq('dam_id', damId);

    if (error) {
      console.error('Error unstarring dam:', error);
      return jsonPrivate({ error: 'Could not unstar dam' }, { status: 500 });
    }

    return jsonPrivate({ ok: true });
  } catch (error) {
    console.error('Error unstarring dam:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}
