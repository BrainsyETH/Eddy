// src/components/blog/DirectoryCards.tsx
// Inline directory of every active outfitter / campground / cabin that
// operates on a river. Renders contact info (phone, website, reservations)
// directly on the blog page — no off-page redirects required to act on it.
// Server component; fetched at render time so listings stay current.

import { createAdminClient } from '@/lib/supabase/admin';

interface ServiceRow {
  name: string;
  slug: string;
  type: 'outfitter' | 'campground' | 'cabin_lodge' | string;
  status: string;
  phone: string | null;
  phone_toll_free: string | null;
  website: string | null;
  reservation_url: string | null;
  city: string | null;
  state: string | null;
  seasonal_notes: string | null;
  display_order: number | null;
}

const CATEGORIES: {
  type: 'outfitter' | 'campground' | 'cabin_lodge';
  label: string;
  accent: string;
}[] = [
  { type: 'outfitter',   label: 'Outfitters',         accent: 'var(--color-primary-700)' },
  { type: 'campground',  label: 'Campgrounds',        accent: 'var(--color-support-700)' },
  { type: 'cabin_lodge', label: 'Cabins & lodges',    accent: 'var(--color-accent-600)' },
];

interface Props {
  riverSlug: string;
}

function digitsOnly(s: string | null): string {
  return (s ?? '').replace(/\D/g, '');
}

function ServiceCard({ s, accent }: { s: ServiceRow; accent: string }) {
  const phoneHref = digitsOnly(s.phone || s.phone_toll_free);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${s.name}${s.city ? ', ' + s.city : ''}${s.state ? ', ' + s.state : ''}`,
  )}`;
  return (
    <article
      style={{
        background: '#fff',
        border: '2px solid var(--color-primary-700)',
        borderRadius: 8,
        boxShadow: '2px 2px 0 var(--color-neutral-300)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--color-neutral-900)',
            lineHeight: 1.25,
          }}
        >
          {s.name}
        </div>
        {(s.city || s.state) && (
          <div style={{ fontSize: 12, color: 'var(--color-neutral-500)', marginTop: 2 }}>
            {[s.city, s.state].filter(Boolean).join(', ')}
            {s.status === 'seasonal' && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  padding: '1px 6px',
                  background: 'var(--color-secondary-100)',
                  color: 'var(--color-secondary-800)',
                  borderRadius: 4,
                }}
              >
                Seasonal
              </span>
            )}
          </div>
        )}
      </div>

      {s.seasonal_notes && (
        <div style={{ fontSize: 12, color: 'var(--color-neutral-600)', lineHeight: 1.45 }}>
          {s.seasonal_notes}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 'auto' }}>
        {phoneHref && (
          <a
            href={`tel:${phoneHref}`}
            style={{ fontSize: 12, fontWeight: 600, color: accent, textDecoration: 'none' }}
          >
            {s.phone || s.phone_toll_free}
          </a>
        )}
        {s.website && (
          <a
            href={s.website}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, fontWeight: 600, color: accent, textDecoration: 'none' }}
          >
            Website
          </a>
        )}
        {s.reservation_url && (
          <a
            href={s.reservation_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, fontWeight: 600, color: accent, textDecoration: 'none' }}
          >
            Reserve
          </a>
        )}
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 12, fontWeight: 600, color: accent, textDecoration: 'none' }}
        >
          Map
        </a>
      </div>
    </article>
  );
}

export default async function DirectoryCards({ riverSlug }: Props) {
  const supabase = createAdminClient();

  const { data: river } = await supabase
    .from('rivers')
    .select('id')
    .eq('slug', riverSlug)
    .single();

  let services: ServiceRow[] = [];
  if (river) {
    const { data: links } = await supabase
      .from('service_rivers')
      .select(`
        is_primary,
        nearby_services!inner (
          name, slug, type, status,
          phone, phone_toll_free, website, reservation_url,
          city, state, seasonal_notes, display_order
        )
      `)
      .eq('river_id', river.id);

    services = ((links ?? []) as unknown as Array<{ nearby_services: ServiceRow | null }>)
      .map((l) => l.nearby_services)
      .filter((s): s is ServiceRow => !!s)
      .filter((s) => s.status === 'active' || s.status === 'seasonal')
      .sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));
  }

  const grouped = new Map<string, ServiceRow[]>();
  for (const s of services) {
    const arr = grouped.get(s.type) ?? [];
    arr.push(s);
    grouped.set(s.type, arr);
  }

  return (
    <div data-guide-directory style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {CATEGORIES.map((cat) => {
        const list = grouped.get(cat.type) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={cat.type}>
            <header
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <div
                className="eyebrow"
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
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--color-neutral-500)',
                }}
              >
                {list.length}
              </div>
            </header>
            <div
              data-guide-directory-grid
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
              }}
            >
              {list.map((s) => (
                <ServiceCard key={s.slug} s={s} accent={cat.accent} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
