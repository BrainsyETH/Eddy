// src/components/river/OfferingSummary.tsx
// What a service offers, as at most three labelled lines — Float, Stay,
// Also — from offeringSummary(). The one rendering of offerings on the
// website: the guide directory, the river report's lists and the planner's
// directory all use it, in place of a pill per offering (which wrapped to
// three rows of the same weight as the NPS badge on a full-service outfitter).
//
// No hooks and no 'use client', so server and client components can both
// render it.

import { offeringSummary } from '@/lib/services/offerings';
import { cx } from '@/lib/utils/cx';

export default function OfferingSummary({
  offerings,
  className,
}: {
  offerings: string[] | null | undefined;
  className?: string;
}) {
  const lines = offeringSummary(offerings);
  if (lines.length === 0) return null;
  return (
    <dl className={cx('m-0 grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-0.5', className)}>
      {lines.map((line) => (
        <div key={line.group} className="contents">
          <dt className="text-[10px] font-bold uppercase tracking-[.1em] text-neutral-500">{line.group}</dt>
          <dd className="m-0 text-[13px] leading-snug text-neutral-700">{line.text}</dd>
        </div>
      ))}
    </dl>
  );
}
