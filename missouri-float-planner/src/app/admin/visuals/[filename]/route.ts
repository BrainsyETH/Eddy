import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { VISUAL_GUIDES } from '@/lib/admin/visual-guides';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};

const ADMIN_NAV = `<nav aria-label="Admin navigation" style="max-width:1120px;margin:16px auto;padding:0 20px;display:flex;flex-wrap:wrap;gap:12px 24px;font:500 14px/1.5 system-ui,sans-serif"><a href="/admin/visuals" style="color:inherit;padding:8px 0">← All visual guides</a><a href="/admin" style="color:inherit;padding:8px 0">Admin dashboard</a></nav>`;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  // Route handlers do not run the admin layout. Validate the signed session
  // here on every request, before resolving a filename or reading any HTML.
  const authError = requireAdminAuth(request);
  if (authError) {
    if (authError.status === 401) {
      return NextResponse.redirect(new URL('/admin/visuals', request.url), {
        status: 307,
        headers: PRIVATE_HEADERS,
      });
    }
    return authError;
  }

  const { filename } = await params;
  const guide = VISUAL_GUIDES.find((entry) => entry.file === filename);
  if (!guide) {
    return new NextResponse('Guide not found', { status: 404, headers: PRIVATE_HEADERS });
  }

  // Read only the allowlisted filename, never a user-controlled filesystem path.
  const html = await readFile(
    path.join(process.cwd(), 'content', 'admin-visuals', guide.file),
    'utf8',
  );

  // These standalone files omit optional <head>/<body> tags. Insert before
  // their shared collection nav rather than relying on an explicit body tag.
  const document = html.replace('<nav class="vx-nav"', `${ADMIN_NAV}<nav class="vx-nav"`);
  return new NextResponse(document, {
    headers: {
      ...PRIVATE_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    },
  });
}
