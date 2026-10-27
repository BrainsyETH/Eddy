import { gaugeDetailResponse } from '@/lib/gauges/detail-response';
import { withX402Route } from '@/lib/x402-config';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
export type { GaugeDetail, GaugeDetailResponse, GaugeDetailThreshold, GaugeFloodStages, GaugeFloodAlert } from '@/lib/gauges/detail-response';

export const dynamic = 'force-dynamic';
export const GET = withX402Route<{ params: Promise<{ siteId: string }> }>(async (request, context) => {
  // Keep the public detail quota here; image rendering has its own quota.
  const limited = await rateLimit(`gauge-detail:${getClientIp(request)}`, 60, 60_000);
  return limited ?? gaugeDetailResponse(request, context);
}, '/api/gauges/:siteId');
