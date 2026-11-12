// GET /llms.txt
// Site summary for language models, in the llmstxt.org format. The text is
// built in src/lib/llms/content.ts.

import { NextResponse } from 'next/server';
import { campingWebEnabled } from '@/lib/camping/web-launch';
import { floatSearchLaunch } from '@/lib/float-search-launch';
import { publishedLakes } from '@/lib/lakes/public-pages';
import { buildLlmsTxt } from '@/lib/llms/content';
import { X402_ENABLED } from '@/lib/x402/config';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

export const revalidate = 300;

export async function GET() {
  const content = buildLlmsTxt({
    baseUrl: BASE_URL,
    x402Enabled: X402_ENABLED,
    campingEnabled: campingWebEnabled(),
    floatSearchEnabled: floatSearchLaunch().web,
    lakes: publishedLakes(),
  });

  return new NextResponse(content.trim(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
