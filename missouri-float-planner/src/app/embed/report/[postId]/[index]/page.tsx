import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { hasValidMachineBearer } from '@/lib/security/machine-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isDailyReport } from '@/lib/social/daily-report';
import DailyReportSlide from '@/components/admin/social/DailyReportSlide';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Daily Report export', robots: { index: false, follow: false } };

export default async function ReportExport({ params }: { params: Promise<{ postId: string; index: string }> }) {
  if (!hasValidMachineBearer((await headers()).get('authorization'), process.env.CRON_SECRET)) notFound();
  const { postId, index } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(postId) || !/^[0-4]$/.test(index)) notFound();
  const { data: post } = await createAdminClient().from('social_posts').select('render_request, post_type').eq('id', postId).single();
  if (post?.post_type !== 'daily_digest' || !isDailyReport(post.render_request) || !post.render_request.slides[Number(index)]) notFound();
  return <DailyReportSlide report={post.render_request} index={Number(index)} />;
}
