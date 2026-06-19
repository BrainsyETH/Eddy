// src/components/blog/DirectoryCards.tsx
// Inline directory of every active outfitter / campground / cabin that
// operates on a river, rendered directly on the guide page — no off-page
// redirects required to act on it. Server component; fetched at render time
// so listings stay current.
//
// Surfaces the structured data we already hold: what each outfitter rents
// (offerings), a short description, the NPS/USFS "authorized" trust badge,
// campground site counts + nightly fee, and a prominent Reserve button. NPS
// campgrounds (linked via access points) are merged in with their photos.

import Image from 'next/image';
import { createAdminClient } from '@/lib/supabase/admin';
import { orderedOfferings, offeringLabel } from '@/lib/services/offerings';

type ServiceType = 'outfitter' | 'campground' | 'cabin_lodge';

interface ServiceRow {
  name: string;
  slug: string;
  type: ServiceType | string;
  status: string;
  phone: string | null;
  phone_toll_free: string | null;
  website: string | null;
  reservation_url: string | null;
  city: string | null;
  state: string | null;
  description: string | null;
  services_offered: string[] | null;
  seasonal_notes: string | null;
  nps_authorized: boolean | null;
  usfs_authorized: boolean | null;
  tent_sites: number | null;
  rv_sites: number | null;
  fee_range: string | null;
  display_order: number | null;
}

interface NpsCampgroundRow {
  id: string;
  name: string;
  nps_url: string | null;
  reservation_url: string | null;
  total_sites: number | null;
  sites_reservable: number | null;
  fees: unknown;
  images: unknown;
}

// Normalized card shape so service rows and NPS campgrounds render identically.
interface DirectoryItem {
  key: string;
  name: string;
  type: ServiceType;
  status: string;
  city: string | null;
  state: string | null;
  phone: string | null;
  website: string | null;
  reservationUrl: string | null;
  description: string | null;
  offerings: string[];
  authorized: 'NPS' | 'USFS' | null;
  imageUrl: string | null;
  imageAlt: string;
  sitesLabel: string | null;
  feeLabel: string | null;
  displayOrder: number;
}

const CATEGORIES: { type: ServiceType; label: string; accent: string }[] = [
  { type: 'outfitter', label: 'Outfitters', accent: 'var(--color-primary-700)' },
  { type: 'campground', label: 'Campgrounds', accent: 'var(--color-support-700)' },
  { type: 'cabin_lodge', label: 'Cabins & lodges', accent: 'var(--color-accent-600)' },
];

const MAX_CHIPS = 5;

interface Props {
  riverSlug: string;
}

function digitsOnly(s: string | null): string {
  return (s ?? '').replace(/\D/g, '');
}

// nps_campgrounds.images / .fees are jsonb scalar strings holding array text
// (supabase returns them as a JS string), so unwrap up to two layers of
// JSON-string encoding before using the value.
function parseJsonish<T>(value: unknown): T | null {
  let v: unknown = value;
  for (let i = 0; i < 2 && typeof v === 'string'; i++) {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  return (v ?? null) as T | null;
}

// NPS image arrays often lead with a campsite map; prefer a real photo.
function npsHeroImage(raw: unknown): { url: string; alt: string } | null {
  const imgs = parseJsonish<Array<{ url?: string; altText?: string; title?: string }>>(raw);
  if (!Array.isArray(imgs) || imgs.length === 0) return null;
  const isMap = (i: { altText?: string; title?: string }) =>
    /\bmap\b/i.test(`${i.altText ?? ''} ${i.title ?? ''}`);
  const pick = imgs.find((i) => i.url && !isMap(i)) ?? imgs.find((i) => i.url);
  if (!pick?.url) return null;
  return { url: pick.url, alt: pick.altText || pick.title || '' };
}

function npsFeeLabel(raw: unknown): string | null {
  const fees = parseJsonish<Array<{ cost?: string | number }>>(raw);
  if (!Array.isArray(fees)) return null;
  const costs = fees
    .map((f) => (typeof f.cost === 'string' ? parseFloat(f.cost) : f.cost))
    .filter((n): n is number => typeof n === 'number' && !isNaN(n) && n > 0);
  if (costs.length === 0) return null;
  const min = Math.min(...costs);
  return `from $${Number.isInteger(min) ? min : min.toFixed(2)}/night`;
}

function siteCountLabel(total: number | null, reservable: number | null): string | null {
  if (!total) return null;
  return reservable ? `${total} sites · ${reservable} reservable` : `${total} sites`;
}

function nearbySitesLabel(tent: number | null, rv: number | null): string | null {
  const total = (tent ?? 0) + (rv ?? 0);
  return total > 0 ? `${total} sites` : null;
}

function mapUrl(name: string, city: string | null, state: string | null): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${name}${city ? ', ' + city : ''}${state ? ', ' + state : ''}`,
  )}`;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--color-neutral-700)',
        background: 'var(--color-neutral-100)',
        border: '1px solid var(--color-neutral-200)',
        borderRadius: 4,
        padding: '2px 7px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function ServiceCard({ item, accent }: { item: DirectoryItem; accent: string }) {
  const phoneHref = digitsOnly(item.phone);
  const chips = orderedOfferings(item.offerings).slice(0, MAX_CHIPS);
  const extra = Math.max(0, item.offerings.length - chips.length);
  const meta = [item.sitesLabel, item.feeLabel].filter(Boolean).join(' · ');

  return (
    <article
      style={{
        background: '#fff',
        border: '2px solid var(--color-primary-700)',
        borderRadius: 8,
        boxShadow: '2px 2px 0 var(--color-neutral-300)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {item.imageUrl && (
        <div
          style={{
            position: 'relative',
            height: 120,
            background: 'var(--color-secondary-100)',
            borderBottom: '2px solid var(--color-primary-700)',
          }}
        >
          <Image
            src={item.imageUrl}
            alt={item.imageAlt || item.name}
            fill
            loading="lazy"
            sizes="(max-width: 767px) 100vw, 320px"
            style={{ objectFit: 'cover' }}
          />
        </div>
      )}

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-neutral-900)', lineHeight: 1.25 }}>
              {item.name}
            </div>
            {item.authorized && (
              <span
                title={`${item.authorized}-authorized concessioner`}
                style={{
                  flexShrink: 0,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  background: 'var(--color-support-100)',
                  color: 'var(--color-support-700)',
                  border: '1px solid var(--color-support-300)',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                }}
              >
                ✓ {item.authorized}
              </span>
            )}
          </div>
          {(item.city || item.state) && (
            <div style={{ fontSize: 12, color: 'var(--color-neutral-500)', marginTop: 2 }}>
              {[item.city, item.state].filter(Boolean).join(', ')}
              {item.status === 'seasonal' && (
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

        {item.description && (
          <div
            style={{
              fontSize: 12.5,
              color: 'var(--color-neutral-600)',
              lineHeight: 1.45,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {item.description}
          </div>
        )}

        {chips.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {chips.map((o) => (
              <Chip key={o}>{offeringLabel(o)}</Chip>
            ))}
            {extra > 0 && <Chip>+{extra}</Chip>}
          </div>
        )}

        {meta && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--color-neutral-700)' }}>
            {meta}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 'auto', paddingTop: 4 }}>
          {item.reservationUrl && (
            <a
              href={item.reservationUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#fff',
                background: 'var(--color-support-600)',
                border: '1.5px solid var(--color-neutral-900)',
                borderRadius: 6,
                padding: '5px 12px',
                textDecoration: 'none',
                boxShadow: '1.5px 1.5px 0 var(--color-neutral-900)',
              }}
            >
              Reserve →
            </a>
          )}
          {phoneHref && (
            <a href={`tel:${phoneHref}`} style={{ fontSize: 12, fontWeight: 600, color: accent, textDecoration: 'none' }}>
              {item.phone}
            </a>
          )}
          {item.website && (
            <a href={item.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: accent, textDecoration: 'none' }}>
              Website
            </a>
          )}
          <a
            href={mapUrl(item.name, item.city, item.state)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, fontWeight: 600, color: accent, textDecoration: 'none' }}
          >
            Map
          </a>
        </div>
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

  if (!river) return null;

  // 1) Services linked via service_rivers.
  const { data: links } = await supabase
    .from('service_rivers')
    .select(`
      nearby_services!inner (
        name, slug, type, status,
        phone, phone_toll_free, website, reservation_url,
        city, state, description, services_offered, seasonal_notes,
        nps_authorized, usfs_authorized, tent_sites, rv_sites, fee_range,
        display_order
      )
    `)
    .eq('river_id', river.id);

  const serviceItems: DirectoryItem[] = ((links ?? []) as unknown as Array<{ nearby_services: ServiceRow | null }>)
    .map((l) => l.nearby_services)
    .filter((s): s is ServiceRow => !!s)
    .filter((s) => s.status === 'active' || s.status === 'seasonal')
    .map((s) => ({
      key: `svc-${s.slug}`,
      name: s.name,
      type: (s.type as ServiceType) ?? 'outfitter',
      status: s.status,
      city: s.city,
      state: s.state,
      phone: s.phone || s.phone_toll_free,
      website: s.website,
      reservationUrl: s.reservation_url,
      description: s.description || s.seasonal_notes,
      offerings: s.services_offered ?? [],
      authorized: s.nps_authorized ? 'NPS' : s.usfs_authorized ? 'USFS' : null,
      imageUrl: null,
      imageAlt: '',
      sitesLabel: s.type === 'campground' ? nearbySitesLabel(s.tent_sites, s.rv_sites) : null,
      feeLabel: s.fee_range,
      displayOrder: s.display_order ?? 999,
    }));

  // 2) NPS campgrounds linked via access points — fully-populated (photos,
  //    reservable site counts, reserve links) but otherwise absent from guides.
  const { data: aps } = await supabase
    .from('access_points')
    .select('nps_campground_id')
    .eq('river_id', river.id)
    .not('nps_campground_id', 'is', null);

  const npsIds = Array.from(
    new Set(((aps ?? []) as Array<{ nps_campground_id: string | null }>).map((a) => a.nps_campground_id).filter((id): id is string => !!id)),
  );

  let npsItems: DirectoryItem[] = [];
  if (npsIds.length > 0) {
    const { data: cgs } = await supabase
      .from('nps_campgrounds')
      .select('id, name, nps_url, reservation_url, total_sites, sites_reservable, fees, images')
      .in('id', npsIds);

    // Don't double-list a campground already present in nearby_services.
    const existingNames = serviceItems
      .filter((i) => i.type === 'campground')
      .map((i) => i.name.toLowerCase());

    npsItems = ((cgs ?? []) as NpsCampgroundRow[])
      .filter((cg) => {
        const base = cg.name.toLowerCase().replace(/ campground$/i, '');
        return !existingNames.some((n) => n.includes(base) || base.includes(n));
      })
      .map((cg) => {
        const hero = npsHeroImage(cg.images);
        return {
          key: `nps-${cg.id}`,
          name: cg.name,
          type: 'campground' as ServiceType,
          status: 'active',
          city: null,
          state: 'MO',
          phone: null,
          website: cg.reservation_url || cg.nps_url,
          reservationUrl: cg.reservation_url,
          description: null,
          offerings: ['camping_primitive'],
          authorized: 'NPS' as const,
          imageUrl: hero?.url ?? null,
          imageAlt: hero?.alt ?? '',
          sitesLabel: siteCountLabel(cg.total_sites, cg.sites_reservable),
          feeLabel: npsFeeLabel(cg.fees),
          displayOrder: 900,
        };
      });
  }

  const all = [...serviceItems, ...npsItems];

  const grouped = new Map<ServiceType, DirectoryItem[]>();
  for (const item of all) {
    const arr = grouped.get(item.type) ?? [];
    arr.push(item);
    grouped.set(item.type, arr);
  }
  grouped.forEach((arr) => {
    arr.sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
  });

  if (all.length === 0) return null;

  return (
    <div data-guide-directory style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {CATEGORIES.map((cat) => {
        const list = grouped.get(cat.type) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={cat.type}>
            <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
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
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--color-neutral-500)' }}>
                {list.length}
              </div>
            </header>
            <div data-guide-directory-grid style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {list.map((item) => (
                <ServiceCard key={item.key} item={item} accent={cat.accent} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
