// GET /llms-full.txt
// Extended version of llms.txt with dynamically populated river data,
// access point counts, current conditions, and gauge info. The catalog is
// loaded in src/lib/llms/full-response.ts and the text built in
// src/lib/llms/content.ts.

import { llmsFullResponse } from '@/lib/llms/full-response';
import { createClient } from '@/lib/supabase/server';
import { X402_ENABLED } from '@/lib/x402/config';

// Rendered per request; the Cache-Control header on a successful response
// lets the CDN hold it for an hour.
export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

export async function GET() {
  return llmsFullResponse(createClient, { baseUrl: BASE_URL, x402Enabled: X402_ENABLED });
}
