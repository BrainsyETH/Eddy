// src/components/blog/DriveTimesStrip.tsx
// Mile-stat-strip-shaped row showing drive times from canonical reference
// cities. Each tile becomes a Google Maps Directions link — origin is
// omitted so Maps fills it in with the user's current location, and the
// destination is parsed out of the hours string ("~3 hr to Akers" →
// destination "Akers").

import type { DriveTime } from '@/types/blog';

interface Props {
  driveTimes: DriveTime[];
  /**
   * The guide's river state, used to disambiguate the destination for Maps.
   *
   * Was the literal "Missouri", which sent every Arkansas guide's drive-time
   * tile to the wrong state — a "Jasper, AR" destination deep-linked to
   * Jasper, Missouri. Optional so a caller without it degrades to an
   * unqualified search rather than a confidently wrong one.
   */
  riverState?: string | null;
  riverName?: string | null;
}

function parseDestination(hours: string, fallbackDest: string): string {
  const m = hours.match(/to\s+(.+?)$/i);
  if (m && m[1]) return m[1].trim();
  return fallbackDest;
}

function directionsHref(rawDest: string, state: string | null | undefined): string {
  const dest = encodeURIComponent(state ? `${rawDest}, ${state}` : rawDest);
  // Omitting `origin` makes Maps default to the user's current location.
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
}

export default function DriveTimesStrip({ driveTimes, riverState, riverName }: Props) {
  if (driveTimes.length === 0) return null;

  return (
    <div
      data-guide-drive-times
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${driveTimes.length}, 1fr)`,
        gap: 0,
        background: 'var(--color-secondary-50)',
        border: '2px solid var(--color-primary-700)',
        borderRadius: 8,
        boxShadow: '2px 2px 0 var(--color-neutral-300)',
        padding: '14px 18px',
      }}
    >
      {driveTimes.map((d, i) => {
        // The fallback was the literal "Current River Missouri" — one river's
        // name, on every guide. Use the guide's own river when the hours string
        // does not name a destination.
        const dest = parseDestination(d.hours, riverName ?? d.city);
        return (
          <div
            key={d.city}
            style={{
              padding: '0 14px',
              borderRight: i < driveTimes.length - 1 ? '1px dashed var(--color-neutral-300)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div
              className="eyebrow"
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                color: 'var(--color-neutral-500)',
              }}
            >
              {d.city}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--color-neutral-900)',
              }}
            >
              {d.hours}
            </div>
            <a
              href={directionsHref(dest, riverState)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--color-primary-600)',
                textDecoration: 'none',
              }}
            >
              Get directions →
            </a>
          </div>
        );
      })}
    </div>
  );
}
