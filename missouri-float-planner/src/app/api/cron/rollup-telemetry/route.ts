import { NextRequest, NextResponse } from 'next/server';
import { hasValidMachineBearer } from '@/lib/security/machine-auth';
import { withJobRun } from '@/lib/admin/dashboard/job-run';
import { rollupTelemetry } from '@/lib/telemetry/rollup';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (
    !secret ||
    !hasValidMachineBearer(request.headers.get('authorization'), secret)
  )
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await rollupTelemetry();
    return NextResponse.json(result, { status: result.errors ? 503 : 200 });
  } catch {
    return NextResponse.json(
      { error: 'Telemetry rollup unavailable' },
      { status: 503 },
    );
  }
}
export const GET = withJobRun('rollup-telemetry', run);
export const POST = GET;
