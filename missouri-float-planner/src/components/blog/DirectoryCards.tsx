// src/components/blog/DirectoryCards.tsx
// Tight 3-card summary of outfitters / campgrounds / cabins for a river,
// replacing the bulky /embed/services iframe in the blog. Server component;
// fetches with the admin client so it works for unauthenticated visitors.
// Full interactive directory still lives at /rivers/{slug}.

import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';

interface Service {
  name: string;
  slug: string;
  type: 'outfitter' | 'campground' | 'cabin_lodge' | string;
  status: string;
}

const CATEGORIES: {
  type: 'outfitter' | 'campground' | 'cabin_lodge';
  label: string;
  filterParam: string;
  accent: string;
}[] = [
  { type: 'outfitter',  label: 'Outfitters',          filterParam: 'outfitter',  accent: 'var(--color-primary-700)' },
  { type: 'campground', label: 'Campgrounds',         filterParam: 'campground', accent: 'var(--color-support-700)' },
  { type: 'cabin_lodge', label: 'Cabins & lodges',    filterParam: 'cabin_lodge', accent: 'var(--color-accent-600)' },
];

interface Props {
  riverSlug: string;
}

export default async function DirectoryCards({ riverSlug }: Props) {
  const supabase = createAdminClient();

  const { data: river } = await supabase
    .from('rivers')
    .select('id')
    .eq('slug', riverSlug)
    .single();

  let services: Service[] = [];
  if (river) {
    const { data: links } = await supabase
      .from('service_rivers')
      .select('is_primary, nearby_services!inner ( name, slug, type, status, display_order )')
      .eq('river_id', river.id);

    services = ((links ?? []) as Array<{
      nearby_services: Service & { display_order: number | null } | null;
    }>)
      .map((l) => l.nearby_services)
      .filter((s): s is Service & { display_order: number | null } => !!s)
      .filter((s) => s.status === 'active' || s.status === 'seasonal')
      .sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));
  }

  const grouped = new Map<string, Service[]>();
  for (const s of services) {
    const arr = grouped.get(s.type) ?? [];
    arr.push(s);
    grouped.set(s.type, arr);
  }

  return (
    <div
      data-guide-directory
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 14,
      }}
    >
      {CATEGORIES.map((cat) => {
        const list = grouped.get(cat.type) ?? [];
        const top = list.slice(0, 3);
        const remaining = list.length - top.length;
        return (
          <div
            key={cat.type}
            style={{
              background: '#fff',
              border: '2px solid var(--color-primary-700)',
              borderRadius: 8,
              boxShadow: '2px 2px 0 var(--color-neutral-300)',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: cat.accent,
                }}
              >
                {cat.label}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--color-neutral-900)',
                  lineHeight: 1,
                }}
              >
                {list.length}
              </div>
            </div>

            {top.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--color-neutral-500)', fontStyle: 'italic' }}>
                None listed.
              </div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {top.map((s) => (
                  <li
                    key={s.slug}
                    style={{
                      fontSize: 14,
                      color: 'var(--color-neutral-800)',
                      lineHeight: 1.35,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {s.name}
                  </li>
                ))}
              </ul>
            )}

            {remaining > 0 && (
              <div style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                + {remaining} more
              </div>
            )}

            {list.length > 0 && (
              <Link
                href={`/rivers/${riverSlug}#services`}
                style={{
                  marginTop: 'auto',
                  fontSize: 13,
                  fontWeight: 600,
                  color: cat.accent,
                  textDecoration: 'none',
                }}
              >
                Browse all →
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
