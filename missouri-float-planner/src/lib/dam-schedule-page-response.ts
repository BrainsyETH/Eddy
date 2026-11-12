import { NextResponse, type NextRequest } from 'next/server';
import { scheduleShareDate, validScheduleDate } from '@shared/dam-schedule-share';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';
import { EMBED_LIGHT_TOKENS as t } from '@/lib/embed/options';
import { DAM_SCHEDULE_ROBOTS_HEADER, damScheduleExpired } from './dam-schedule-indexing';

const HTML_ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => HTML_ENTITIES[char]);
}

/** Reject expired exports before loading.tsx can stream a misleading HTTP 200.
 * This checks only the dated HTML path and the static registry, never providers.
 */
export function damSchedulePageResponse(request: NextRequest, now = Date.now()): NextResponse | null {
  const match = /^\/dams\/([a-zA-Z0-9_-]+)\/schedule\/([^/]+)\/?$/.exec(request.nextUrl.pathname);
  if (!match) return null;
  const [, damId, date] = match;
  const dam = getUsaceDam(damId);
  const valid = Boolean(dam?.swpaCode) && validScheduleDate(date);
  if (valid && !damScheduleExpired(date, now)) return null;
  const status = valid ? 410 : 404;
  const title = valid ? 'This schedule has expired' : 'Schedule not found';
  const detail = valid
    ? `${dam!.name} · ${scheduleShareDate(date)}. Open the dam for the latest schedule and conditions.`
    : 'This dated schedule link is unavailable. Check the latest dam schedules.';
  const href = dam ? `/dams/${encodeURIComponent(damId)}#generation` : '/dams';
  const label = dam ? `Latest ${dam.name} schedule` : 'View lakes and dams';
  return new NextResponse(`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, follow"><title>${title} | Eddy</title>
<style>
@font-face{font-family:Geist;src:url('/fonts/Geist-Regular.ttf') format('truetype');font-display:swap}
*{box-sizing:border-box}body{margin:0;background:${t.surface};color:${t.text};font:16px/1.5 Geist,system-ui,sans-serif}
main{max-width:42rem;margin:8vh auto;padding:24px}article{padding:28px;background:${t.bg};border:2px solid ${t.frame};border-radius:20px;box-shadow:5px 5px ${t.frameShadow}}
.brand{display:flex;align-items:center;gap:12px;color:${t.frame};font-size:22px;font-weight:bold;text-decoration:none}
h1{font-size:28px;line-height:1.2;color:${t.frame};margin:24px 0 12px}p{color:${t.muted};margin:0 0 24px}
.action{display:inline-flex;align-items:center;min-height:44px;padding:10px 16px;border:1px solid ${t.frame};border-radius:8px;color:${t.frame};text-decoration:none}
a:focus-visible{outline:3px solid ${t.accent};outline-offset:4px}nav{margin-top:24px}nav a{display:inline-flex;align-items:center;min-height:44px;color:${t.frame}}
@media(max-width:400px){main{padding:16px}article{padding:20px}h1{font-size:24px}}
</style></head><body><main><article>
<a class="brand" href="/"><img src="/icons/eddy-dam.png" width="44" height="44" alt="">Eddy</a>
<h1>${title}</h1><p>${escapeHtml(detail)}</p>
<a class="action" href="${escapeHtml(href)}">${escapeHtml(label)}</a>
</article><nav><a href="/dams">All lakes and dams</a></nav></main></body></html>`, {
    status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': DAM_SCHEDULE_ROBOTS_HEADER },
  });
}
