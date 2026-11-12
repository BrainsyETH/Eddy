import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';
import { DAM_SCHEDULE_IMAGE_SIZE, damScheduleFileName, damSchedulePath, damScheduleTitle, scheduleShareDate, validScheduleDate } from '@shared/dam-schedule-share';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';
import { loadDamScheduleShare } from '@/lib/dam-schedule-share';
import { jsonLdString } from '@/lib/json-ld';
import { SITE_URL } from '@/lib/dam-page-copy';
import DamScheduleShareButton from '@/components/dam/DamScheduleShareButton';

type Props = { params: Promise<{ damId: string; date: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { damId, date } = await params;
  const dam = getUsaceDam(damId);
  if (!dam?.swpaCode || !validScheduleDate(date)) return { title: 'Schedule not found', robots: { index: false } };
  const model = await loadDamScheduleShare(damId, date);
  const title = damScheduleTitle(dam.name, date);
  const description = `${dam.name}'s posted generation schedule for ${scheduleShareDate(date)}, Central Time. Source: Southwestern Power Administration. Schedules can change.`;
  return {
    title, description,
    alternates: { canonical: `${SITE_URL}${damSchedulePath(damId, date)}` },
    robots: { index: Boolean(model), follow: true, googleBot: { 'max-image-preview': 'large' } },
    openGraph: { title, description, type: 'website', url: `${SITE_URL}${damSchedulePath(damId, date)}`,
      images: model ? [{ url: `${SITE_URL}${model.imagePath}`, ...DAM_SCHEDULE_IMAGE_SIZE, alt: title }] : [] },
    twitter: { card: 'summary_large_image', title, description, images: model ? [`${SITE_URL}${model.imagePath}`] : [] },
  };
}

export default async function ScheduleImagePage({ params }: Props) {
  await connection();
  const { damId, date } = await params;
  const dam = getUsaceDam(damId);
  if (!dam?.swpaCode || !validScheduleDate(date)) notFound();
  const model = await loadDamScheduleShare(damId, date);
  const livePath = `/dams/${damId}#generation`;
  return <main className="mx-auto max-w-4xl px-4 py-6 sm:py-10">
    <Link href={livePath} className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary-700"><ArrowLeft className="size-4" aria-hidden="true" />Latest {dam.name} schedule</Link>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="font-heading text-2xl font-bold text-primary-800">{dam.name} generation schedule</h1><p className="mt-1 text-neutral-600">{scheduleShareDate(date)} · Central Time</p></div>
      {model && <DamScheduleShareButton damId={damId} name={dam.name} dates={[date]} />}
    </div>
    {model ? <>
      <figure>
        {/* A real, server-rendered image on its dated landing page for crawlers and sharing. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={model.imagePath} alt={`${damScheduleTitle(dam.name, date)}. ${model.summary}. ${model.checked}.`} {...DAM_SCHEDULE_IMAGE_SIZE} className="h-auto w-full rounded-xl" />
        <figcaption className="mt-3 space-y-1 text-sm text-neutral-600"><p>{model.summary}</p><p>{model.checked}</p><p>Source: {model.source}</p>{model.warning && <p className="font-medium text-accent-800">{model.warning}</p>}<p>Schedules can change. Times are at the dam; water arrives downstream later. No generation does not mean no water release.</p></figcaption>
      </figure>
      <a href={model.imagePath} download={`${damScheduleFileName(damId, date)}.png`} className="btn-outline mt-4 min-h-11 gap-2"><Download className="size-4" aria-hidden="true" />Download image</a>
      <details className="mt-6 rounded-xl border border-neutral-200 bg-white p-4"><summary className="min-h-11 cursor-pointer font-medium text-primary-800">Hourly schedule</summary>
        <table className="w-full text-left text-sm"><caption className="sr-only">Scheduled megawatts by hour, Central Time</caption><thead><tr><th className="py-2" scope="col">Hour starting</th><th scope="col">Posted plan</th></tr></thead><tbody>{model.day.hours.map(hour => <tr key={hour.hourEnding} className="border-t border-neutral-100"><th scope="row" className="py-2 font-normal">{hour.label}</th><td>{hour.megawatts === null ? 'Unavailable' : hour.minimumFlow ? 'Minimum flow' : `${hour.megawatts} MW`}</td></tr>)}</tbody></table>
      </details>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString({
        '@context': 'https://schema.org', '@type': 'ImageObject', name: damScheduleTitle(dam.name, date),
        contentUrl: `${SITE_URL}${model.imagePath}`, url: `${SITE_URL}${model.pagePath}`,
        caption: `${model.summary}. ${model.checked}. Source: ${model.source}.`,
        creator: { '@type': 'Organization', name: 'Eddy', url: SITE_URL },
        ...DAM_SCHEDULE_IMAGE_SIZE,
      }) }} />
    </> : <div className="rounded-xl border border-neutral-200 bg-white p-6"><h2 className="font-heading text-lg font-bold">This dated schedule is unavailable</h2><p className="mt-2 text-neutral-600">A posted schedule is unavailable for this date. Check the dam page for the latest information.</p><Link href={livePath} className="btn-outline mt-4 min-h-11">View latest schedule</Link></div>}
  </main>;
}
