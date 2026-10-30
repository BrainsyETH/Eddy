import type { NextRequest } from 'next/server';
import { loadFloatShareNames } from '@/lib/float-share/names';
import { respondFloatShare } from '@/lib/float-share/respond';
import { createClient } from '@/lib/supabase/server';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A float's 9:16 share image (shared/float-share.ts; ADR 0015, "Float share
 * images"). Stateless, and an attachment, not a link preview: anything the
 * app should not share is an error the app reports, never a stand-in picture,
 * because the share control treats any PNG as the image it asked for. The
 * link that travels with it is the river's page, which has its own preview.
 * The decisions live in respondFloatShare; this supplies the real reads.
 */
export async function GET(request: NextRequest) {
  return respondFloatShare(request, {
    limit: () => rateLimit(`float-image:${getClientIp(request)}`, 30, 60_000, { failClosed: true }),
    names: async (state) => loadFloatShareNames(await createClient(), state),
  });
}
