import { gaugeHistoryResponse } from '@/lib/gauges/history-response';
import { withX402Route } from '@/lib/x402-config';

export const dynamic = 'force-dynamic';
export const GET = withX402Route<{ params: Promise<{ siteId: string }> }>(gaugeHistoryResponse, '/api/gauges/:siteId/history');
