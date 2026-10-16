import { gaugeDetailResponse } from '@/lib/gauges/detail-response';
import { withX402Route } from '@/lib/x402-config';
export type { GaugeDetail, GaugeDetailResponse, GaugeDetailThreshold, GaugeFloodStages, GaugeFloodAlert } from '@/lib/gauges/detail-response';

export const dynamic = 'force-dynamic';
export const GET = withX402Route<{ params: Promise<{ siteId: string }> }>(gaugeDetailResponse, '/api/gauges/:siteId');
