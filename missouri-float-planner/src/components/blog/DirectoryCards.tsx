// src/components/blog/DirectoryCards.tsx
// Inline directory of every active outfitter / campground / cabin that
// operates on a river, rendered directly on the guide page — no off-page
// redirects required to act on it. Server component; fetched at render time
// so listings stay current.
//
// Surfaces the structured data we already hold: what each outfitter rents
// (offerings, summarised by offeringSummary), a short description, the NPS/USFS "authorized" trust badge,
// campground site counts + nightly fee, and a prominent Reserve button. NPS
// campgrounds (linked via access points) are merged in with their photos.
//
// Length. The Current lists 40-odd services; as full cards stacked one per
// row on a phone that was a dozen screens of scrolling between the float
// sections and the gauge. So each category shows its first PREVIEW_COUNT
// listings (curated display_order) and folds the rest into a native
// <details> — no client JS, and every listing stays in the HTML for search
// and find-in-page. Below md, a listing is a compact row (name, town, what
// they offer, actions) inside one framed list; from md up it is the full card
// in a grid, adding the description and photo. One DOM, two layouts, switched
// by Tailwind breakpoints.

import Image from 'next/image';
import { ChevronDown } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { createAdminClient } from '@/lib/supabase/admin';
import OfferingSummary from '@/components/river/OfferingSummary';
import { npsHeroImage, npsFeeLabel, npsSiteLabel } from '@/lib/services/npsCampground';

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
export interface DirectoryItem {
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

// `accent` colours the category eyebrow. Full class strings so Tailwind's
// content scan sees them.
const CATEGORIES: { type: ServiceType; label: string; accent: string }[] = [
  { type: 'outfitter', label: 'Outfitters', accent: 'text-primary-700' },
  { type: 'campground', label: 'Campgrounds', accent: 'text-support-700' },
  { type: 'cabin_lodge', label: 'Cabins & lodges', accent: 'text-accent-600' },
];

/** Listings shown before the "Show all" fold. Three fills one row of the
 *  desktop grid. */
const PREVIEW_COUNT = 3;

/** Split a category into what shows and what folds. A fold that would hide a
 *  single listing costs a tap to save one row, so short lists show in full. */
function splitPreview<T>(list: T[]): { shown: T[]; folded: T[] } {
  if (list.length <= PREVIEW_COUNT + 1) return { shown: list, folded: [] };
  return { shown: list.slice(0, PREVIEW_COUNT), folded: list.slice(PREVIEW_COUNT) };
}

interface Props {
  riverSlug: string;
}

function digitsOnly(s: string | null): string {
  return (s ?? '').replace(/\D/g, '');
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

// Action buttons keep the design system's 44px touch target on phones; from
// md up they drop back to the compact sm box.
const ACTION_TOUCH = 'min-h-11 md:min-h-0';

// A listing is a divided row inside the category frame below md, and a
// framed card of its own from md up.
const ITEM_CLASS = [
  'border-t border-dashed border-neutral-300 first:border-t-0',
  'md:flex md:flex-col md:overflow-hidden md:rounded-lg md:border-2 md:border-solid md:border-primary-700 md:bg-white md:shadow-sm md:first:border-t-2',
].join(' ');

const LIST_CLASS = 'm-0 list-none p-0 md:grid md:grid-cols-2 md:gap-3 lg:grid-cols-3';

function DirectoryListing({ item }: { item: DirectoryItem }) {
  const phoneHref = digitsOnly(item.phone);
  const meta = [item.sitesLabel, item.feeLabel].filter(Boolean).join(' · ');
  const place = [item.city, item.state].filter(Boolean).join(', ');

  return (
    <li className={ITEM_CLASS}>
      <article className="flex h-full flex-col">
        {/* Photos are a desktop affordance. Hidden below md, and lazy, so a
            phone never fetches them. */}
        {item.imageUrl && (
          <div className="relative hidden h-[120px] border-b-2 border-primary-700 bg-secondary-100 md:block">
            <Image
              src={item.imageUrl}
              alt={item.imageAlt || item.name}
              fill
              loading="lazy"
              sizes="320px"
              style={{ objectFit: 'cover' }}
            />
          </div>
        )}

        <div className="flex flex-1 flex-col gap-2 px-4 py-3.5">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h4 className="m-0 text-[15px] font-bold leading-tight text-neutral-900">{item.name}</h4>
              {item.authorized && (
                <Badge
                  tone="support"
                  className="shrink-0 whitespace-nowrap"
                  title={`${item.authorized}-authorized concessioner`}
                >
                  ✓ {item.authorized}
                </Badge>
              )}
            </div>
            {(place || item.status === 'seasonal') && (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-600">
                {place && <span>{place}</span>}
                {item.status === 'seasonal' && <Badge tone="secondary">Seasonal</Badge>}
              </div>
            )}
          </div>

          {item.description && (
            <p className="m-0 hidden text-[13px] leading-snug text-neutral-600 md:line-clamp-2">
              {item.description}
            </p>
          )}

          {/* What they offer, grouped into at most three short lines rather
              than a pill per offering — pills are kept for the trust and
              seasonal badges, so those still stand out. */}
          <OfferingSummary offerings={item.offerings} />

          {meta && <div className="font-mono text-xs font-semibold text-neutral-700">{meta}</div>}

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
            {item.reservationUrl && (
              <Button
                href={item.reservationUrl}
                external
                size="sm"
                className={ACTION_TOUCH}
                aria-label={`Reserve at ${item.name}`}
              >
                Reserve →
              </Button>
            )}
            {phoneHref && (
              <Button
                href={`tel:${phoneHref}`}
                variant="outline"
                size="sm"
                className={ACTION_TOUCH}
                aria-label={`Call ${item.name} at ${item.phone}`}
              >
                {/* A phone dials from "Call"; a desktop reader needs the number. */}
                <span className="md:hidden">Call</span>
                <span className="hidden md:inline">{item.phone}</span>
              </Button>
            )}
            {item.website && (
              <Button
                href={item.website}
                external
                variant="outline"
                size="sm"
                className={ACTION_TOUCH}
                aria-label={`${item.name} website`}
              >
                Website
              </Button>
            )}
            <Button
              href={mapUrl(item.name, item.city, item.state)}
              external
              variant="outline"
              size="sm"
              className={ACTION_TOUCH}
              aria-label={`Map to ${item.name}`}
            >
              Map
            </Button>
          </div>
        </div>
      </article>
    </li>
  );
}

export default async function DirectoryCards({ riverSlug }: Props) {
  const supabase = createAdminClient();

  // `state` is selected for the synthetic NPS campground rows below, which used
  // to hardcode 'MO' — see the comment there.
  const { data: river } = await supabase
    .from('rivers')
    .select('id, state')
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
          // The river's state, not 'MO'. A campground inside a national
          // riverway has no town of its own, which is why city is null — but
          // the state is knowable, and asserting it sent every Buffalo
          // National River campground's Directions link to Missouri via
          // mapUrl() above.
          state: river.state ?? null,
          phone: null,
          website: cg.reservation_url || cg.nps_url,
          reservationUrl: cg.reservation_url,
          description: null,
          offerings: ['camping_primitive'],
          authorized: 'NPS' as const,
          imageUrl: hero?.url ?? null,
          imageAlt: hero?.alt ?? '',
          sitesLabel: npsSiteLabel(cg.total_sites, cg.sites_reservable),
          feeLabel: npsFeeLabel(cg.fees),
          displayOrder: 900,
        };
      });
  }

  return <DirectoryView items={[...serviceItems, ...npsItems]} />;
}

/** The directory's markup, given its listings: grouped by category, sorted by
 *  curated display_order, each category folded after PREVIEW_COUNT. Split from
 *  the fetch so it renders without a database. */
export function DirectoryView({ items: all }: { items: DirectoryItem[] }) {
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
    <div className="flex flex-col gap-8">
      {CATEGORIES.map((cat) => {
        const list = grouped.get(cat.type) ?? [];
        if (list.length === 0) return null;
        const { shown, folded } = splitPreview(list);
        const headingId = `directory-${cat.type}`;
        return (
          <section key={cat.type} aria-labelledby={headingId}>
            <header className="mb-3 flex items-baseline justify-between">
              <h3
                id={headingId}
                className={`eyebrow m-0 text-[11px] font-bold uppercase tracking-[.12em] ${cat.accent}`}
              >
                {cat.label}
              </h3>
              <span className="font-mono text-xs font-semibold text-neutral-500">{list.length}</span>
            </header>

            {/* Below md this is one framed list; from md up the frame dissolves
                and each listing carries its own card frame. */}
            <div className="overflow-hidden rounded-lg border-2 border-primary-700 bg-white shadow-sm md:overflow-visible md:rounded-none md:border-0 md:bg-transparent md:shadow-none">
              <ul className={LIST_CLASS}>
                {shown.map((item) => (
                  <DirectoryListing key={item.key} item={item} />
                ))}
              </ul>

              {folded.length > 0 && (
                <details className="group">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-center gap-2 border-t border-neutral-200 bg-secondary-50 px-4 py-3 text-sm font-semibold text-primary-700 transition-colors duration-fast hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 md:mt-3 md:rounded-lg md:border-2 md:border-primary-700 md:bg-white md:shadow-sm [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">
                      Show all {list.length} {cat.label.toLowerCase()}
                    </span>
                    <span className="hidden group-open:inline">Show fewer</span>
                    <ChevronDown
                      size={16}
                      aria-hidden
                      className="transition-transform duration-normal group-open:rotate-180"
                    />
                  </summary>
                  <ul className={`${LIST_CLASS} border-t border-dashed border-neutral-300 md:mt-3 md:border-t-0`}>
                    {folded.map((item) => (
                      <DirectoryListing key={item.key} item={item} />
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
