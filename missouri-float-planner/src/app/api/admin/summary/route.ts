import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { getDashboardSummary } from '@/lib/admin/dashboard/summary';
export const dynamic='force-dynamic';
export async function GET(request: NextRequest) {
  const denied=requireAdminAuth(request);
  if(denied) return denied;
  return NextResponse.json(await getDashboardSummary(), { headers:{'Cache-Control':'private, no-store'} });
}
