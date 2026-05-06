// src/components/blog/BestForMatrix.tsx
// Inverts the per-section best_for_tags into a "find your float by audience"
// matrix. Lets a reader self-select in 5 seconds without reading every
// section body.

import type { FloatSection } from '@/types/blog';

interface Props {
  sections: FloatSection[];
  riverSlug: string;
  /** Map of access-point slug → UUID, so we can deep-link rows into the
   *  planner. RiverGuideLayout already builds this. */
  apIds: Map<string, string>;
}

interface Row {
  audience: string;
  matches: { sectionId: number; label: string; href?: string }[];
}

const PRETTY: Record<string, string> = {
  'first-timers': 'First-timers',
  'families': 'Families',
  'tubers': 'Tubers',
  'fly-anglers': 'Fly anglers',
  'experienced-paddlers': 'Experienced paddlers',
  'trout-section': 'Trout fishing',
  'spring-chasers': 'Spring hunters',
  'half-day': 'Half-day floats',
  'history': 'History buffs',
  'overnighters': 'Overnighters',
  'bluffs': 'Bluff scenery',
  'smallmouth': 'Smallmouth anglers',
  'multi-day': 'Multi-day trips',
  'springs': 'Spring stops',
  'solitude': 'Solitude',
  'motor-boaters': 'Motor-boaters',
  'anglers': 'Anglers',
  'long-drifts': 'Long quiet drifts',
};

export default function BestForMatrix({ sections, riverSlug, apIds }: Props) {
  const rows: Row[] = [];
  const audienceOrder: string[] = [];

  for (const section of sections) {
    const tags = section.best_for_tags ?? [];
    for (const tag of tags) {
      let row = rows.find((r) => r.audience === tag);
      if (!row) {
        row = { audience: tag, matches: [] };
        rows.push(row);
        audienceOrder.push(tag);
      }
      const putIn = section.from_slug ? apIds.get(section.from_slug) : undefined;
      const takeOut = section.to_slug ? apIds.get(section.to_slug) : undefined;
      const href = putIn && takeOut
        ? `/rivers/${riverSlug}?putIn=${putIn}&takeOut=${takeOut}`
        : undefined;
      row.matches.push({
        sectionId: section.id,
        label: `${section.from} → ${section.to}`,
        href,
      });
    }
  }

  if (rows.length === 0) return null;

  return (
    <div
      style={{
        marginTop: 16,
        background: '#fff',
        border: '2px solid var(--color-primary-700)',
        borderRadius: 8,
        boxShadow: '2px 2px 0 var(--color-neutral-300)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 18px',
          borderBottom: '1px solid var(--color-neutral-200)',
          background: 'var(--color-secondary-50)',
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
            marginBottom: 4,
          }}
        >
          Find your float
        </div>
        <div style={{ fontSize: 14, color: 'var(--color-neutral-700)' }}>
          Pick by who you&rsquo;re paddling with.
        </div>
      </div>
      <div>
        {rows.map((r, i) => (
          <div
            key={r.audience}
            style={{
              display: 'grid',
              gridTemplateColumns: '180px 1fr',
              gap: 16,
              padding: '10px 18px',
              borderTop: i ? '1px dashed var(--color-neutral-200)' : 'none',
              alignItems: 'baseline',
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-neutral-900)',
              }}
            >
              {PRETTY[r.audience] ?? r.audience}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {r.matches.map((m) => (
                m.href ? (
                  <a
                    key={m.sectionId}
                    href={m.href}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--color-primary-700)',
                      textDecoration: 'none',
                      padding: '3px 9px',
                      background: 'var(--color-primary-50)',
                      border: '1px solid var(--color-primary-200)',
                      borderRadius: 999,
                    }}
                  >
                    {m.label}
                  </a>
                ) : (
                  <span
                    key={m.sectionId}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--color-neutral-700)',
                      padding: '3px 9px',
                      background: 'var(--color-neutral-100)',
                      border: '1px solid var(--color-neutral-200)',
                      borderRadius: 999,
                    }}
                  >
                    {m.label}
                  </span>
                )
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
