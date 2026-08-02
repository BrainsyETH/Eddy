// src/components/ui/AvailabilityChip.tsx
// The one approved way to render campsite availability.
//
// ── Why this is not ConditionBadge ─────────────────────────────────────────
//
// ConditionBadge is the single approved way to render a RIVER-CONDITION pill,
// and it owns a learnable colour language: orange means high water, red means
// dangerous. Campsite availability appears on the same cards, and a red "fully
// booked" chip sitting beside a condition badge would read as a dangerous
// river. So this chip borrows ConditionBadge's structure — pill, border, 12px
// floor, a text label that carries the meaning so nothing rests on colour —
// and deliberately none of its palette. Neutral slate throughout, with a tent
// glyph doing the categorical work that hue does over there.
//
// Do not add colour to signal scarcity here. "3 of 55" is already the signal,
// and a red version of it would collide with the safety vocabulary.

import { Tent } from 'lucide-react';
import type { CampsiteAvailabilityInfo } from '@/types/api';

interface AvailabilityChipProps {
  availability: CampsiteAvailabilityInfo | null | undefined;
  /** Facility name, used only by the backcountry-district wording. */
  name?: string;
  className?: string;
}

/**
 * The sentence a chip says, or null when it should not appear at all.
 *
 * Exported for tests: the copy rules are the substance of this component, and
 * the difference between "closed for the season" and "fully booked" is a real
 * difference to somebody deciding whether to keep refreshing.
 */
export function availabilityLabel(
  availability: CampsiteAvailabilityInfo,
  name?: string,
): string | null {
  const { status, sitesOpen, sitesReservable, window, kind } = availability;

  switch (status) {
    case 'closed':
      return 'Closed for the season';

    case 'not_yet_released':
      // Unreachable for a next-weekend window — both booking systems open far
      // wider than nine days — but the status exists, so it gets wording
      // rather than falling through to something false.
      return `Not yet bookable · ${window.label}`;

    case 'full':
      return `Fully booked · ${window.label}`;

    case 'open':
      if (kind === 'backcountry_district') {
        const where = name ? ` · ${name}` : '';
        return `${sitesOpen} backcountry ${sitesOpen === 1 ? 'site' : 'sites'} open${where}`;
      }
      return `${sitesOpen} of ${sitesReservable} sites open · ${window.label}`;
  }
}

/**
 * Renders nothing when there is no availability to report.
 *
 * That is the common case and it is deliberate: only about half of Eddy's
 * campground rows link to a booking system it can read, and every private
 * outfitter has none by nature. An empty slot reads as "not applicable" —
 * the word "unknown" would read as Eddy being broken.
 */
export default function AvailabilityChip({
  availability,
  name,
  className = '',
}: AvailabilityChipProps) {
  if (!availability) return null;

  const label = availabilityLabel(availability, name);
  if (!label) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700 ${className}`}
    >
      <Tent aria-hidden="true" className="h-3 w-3 flex-shrink-0 text-neutral-500" />
      {label}
    </span>
  );
}
