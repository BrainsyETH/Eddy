import type { Metadata } from 'next';
import { appBannerMetadata } from '@/lib/app-discovery';
import { savedTimeRangeLabel } from '@/lib/calculations/saved-time-range';

interface PlanPreview {
  river: string;
  putIn: string;
  takeOut: string;
  distance_miles?: number | string | null;
  estimated_float_min_minutes?: number | null;
  estimated_float_max_minutes?: number | null;
}

export function sharedPlanMetadata(shortCode: string, plan: PlanPreview | 'not-found' | 'unavailable'): Metadata {
  const pageUrl = `https://eddy.guide/plan/${encodeURIComponent(shortCode)}`;
  let title: string;
  let description: string;
  if (typeof plan === 'string') {
    title = plan === 'not-found' ? 'Plan not found' : 'Float plan temporarily unavailable';
    description = plan === 'not-found'
      ? 'This float plan could not be found. Check the link with the person who sent it.'
      : 'This float plan could not be loaded right now. Please try again.';
  } else {
    title = `${plan.putIn} → ${plan.takeOut} · ${plan.river}`;
    const distance = Number(plan.distance_miles);
    const duration = savedTimeRangeLabel(plan);
    const details = [
      Number.isFinite(distance) && distance > 0 ? `${distance.toFixed(1)} miles` : null,
      duration ? `${duration} estimated when saved` : null,
    ].filter(Boolean).join(' · ');
    description = `${details ? `${details}. ` : ''}A saved float plan with put-in and take-out details. Open for current conditions.`;
  }
  return {
    ...appBannerMetadata(`/float/${encodeURIComponent(shortCode)}`),
    title, description,
    alternates: { canonical: pageUrl },
    ...(plan === 'not-found' ? { robots: { index: false } } : {}),
    openGraph: { type: 'website', title, description, url: pageUrl, siteName: 'Eddy' },
    twitter: { card: 'summary_large_image', title, description },
  };
}
