import { gaugeHistoryResponse } from '@/lib/gauges/history-response';
import { withX402Route } from '@/lib/x402-config';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const GET = withX402Route<{ params: Promise<{ siteId: string }> }>(async (request, context) => {
  // Every distinct window is its own CDN key, and a window the stored series
  // cannot cover is fetched live from the provider. Same public allowance as
  // the detail route beside this one.
  const limited = await rateLimit(`gauge-history:${getClientIp(request)}`, 60, 60_000);
  return limited ?? gaugeHistoryResponse(request, context);
}, '/api/gauges/:siteId/history');
