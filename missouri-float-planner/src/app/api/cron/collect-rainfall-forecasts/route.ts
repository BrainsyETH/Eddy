import { NextRequest } from 'next/server';
import { withJobRun } from '@/lib/admin/dashboard/job-run';
import { runResearch } from '@/lib/rainfall/research-route';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const GET = withJobRun('collect-rainfall-forecasts', (request: NextRequest) => runResearch(request, 'forecasts'));
export const POST = GET;
