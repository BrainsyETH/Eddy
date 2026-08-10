// eddy-ios/src/lib/planSupport.ts
// Who can help with this float, grouped by which end of it they are near.
//
// ── WHAT THIS REPLACED, and why grouping beat ranking ─────────────────────
//
// PlanNearby ranked every shuttle on the river by straight-line distance from
// the put-in and showed the closest three. That is a decent answer to "who
// shuttles here" and a poor one to "who shuttles THIS float", because the two
// ends of a float are often forty minutes apart and an outfitter beside the
// take-out is invisible to a list sorted from the put-in.
//
// Eddy already holds a better signal and was not using it: each access point
// carries its own `nearbyServices`, which is somebody having decided that this
// business serves this landing. An explicit association beats a computed
// distance every time, so those come first, under the end they belong to. The
// distance ranking stays for what the associations miss.
//
// ── A PURE MODULE, on purpose ─────────────────────────────────────────────
// No `@/` imports, no react-native. The web suite is the only runner the Expo
// app has, and the ranking this file inherited had never been tested because it
// lived in a useMemo inside a .tsx. See tabs.ts and placeSymbol.ts for the same
// arrangement and the same reason.

import type { NearbyService, RiverService } from '@eddy/types';
import { serviceEligible, serviceOffers, serviceTiers } from '@eddy/types';
// Pure, and imported by path rather than through the app alias for the reason
// in the header. It is the SAME predicate the map draws pins with, which is the
// point: a recommendation must never be computed from a coordinate the map
// itself refuses to plot.
import { mappableService } from '../map/mappable';

/**
 * The shape both service kinds share, which is all this file needs.
 *
 * `NearbyService` is the thin embedded entry on an access point;
 * `RiverService` is the fat directory row. Comparing them is the whole job of
 * `sameService`, so nothing here may narrow to either.
 */
export interface ServiceLike {
  name: string;
  phone?: string | null;
  website?: string | null;
}

/** Digits only, so "(573) 858-3224" and "573-858-3224" are one number. */
function phoneKey(service: ServiceLike): string | null {
  const digits = (service.phone ?? '').replace(/\D/g, '');
  // Ten digits is a US number; a leading 1 is the country code and is dropped so
  // "1-573-…" and "573-…" agree. Anything shorter is a fragment, not a number.
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return local.length === 10 ? local : null;
}

/**
 * The registrable domain, so a deep link and a home page are one business.
 *
 * Deliberately naive about multi-part suffixes: everything in this directory is
 * a .com, .net or .org, and pulling in a public-suffix list to be right about
 * co.uk would be carrying a library for a case that cannot occur here. A wrong
 * answer on `example.co.uk` would merge two businesses that share a suffix,
 * which is why this is written down rather than left to be discovered.
 */
function domainKey(service: ServiceLike): string | null {
  const raw = (service.website ?? '').trim();
  if (!raw) return null;
  const host = raw
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split(/[/?#]/)[0]
    .toLowerCase();
  if (!host.includes('.')) return null;
  return host.split('.').slice(-2).join('.');
}

/**
 * A business name reduced to the part that identifies it.
 *
 * Case, punctuation, a leading "the" and a trailing company suffix are all
 * noise across two sources that were seeded years apart — "Akers Ferry Canoe
 * Rental, LLC" and "Akers Ferry Canoe Rental" are one business.
 */
export function normalizeServiceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the\s+/, '')
    .replace(/\s+(llc|inc|co|company|corp)$/, '')
    .trim();
}

/**
 * Are these two rows the same business?
 *
 * ── NAME ALONE IS NOT ENOUGH, and contact alone is not either ─────────────
 *
 * Matching on the normalized name merges "Riverside Campground" the resort with
 * "Riverside Campground" the county park, which are different businesses with
 * different phone numbers. Matching only on contact details misses the common
 * case entirely: the embedded entry often carries a phone and no website while
 * the directory row carries a website and no phone, so there is nothing to
 * compare.
 *
 * So a hard signal wins outright, and the soft signal is allowed only when
 * nothing contradicts it. Two rows with the same name and two different phone
 * numbers are two businesses; two rows with the same name and one phone between
 * them are one.
 *
 * This is deduplication for DISPLAY. It decides whether to draw one row or two,
 * and nothing downstream inherits a merged record — see loadPlanSupport, which
 * keeps whichever row it drew rather than combining their fields. Merging
 * contact details across sources on this evidence would be attaching a phone
 * number to a business on the strength of a shared name.
 */
export function sameService(a: ServiceLike, b: ServiceLike): boolean {
  const [aPhone, bPhone] = [phoneKey(a), phoneKey(b)];
  if (aPhone && bPhone && aPhone === bPhone) return true;

  const [aDomain, bDomain] = [domainKey(a), domainKey(b)];
  if (aDomain && bDomain && aDomain === bDomain) return true;

  const aName = normalizeServiceName(a.name);
  if (!aName || aName !== normalizeServiceName(b.name)) return false;

  // Same name. Only one thing can still separate them: a contact detail they
  // both have and disagree about.
  if (aPhone && bPhone && aPhone !== bPhone) return false;
  if (aDomain && bDomain && aDomain !== bDomain) return false;
  return true;
}

/** First occurrence wins, which is what makes the caller's order meaningful. */
function dedupe<T extends ServiceLike>(services: readonly T[], against: ServiceLike[] = []): T[] {
  const kept: T[] = [];
  for (const service of services) {
    if (against.some((seen) => sameService(seen, service))) continue;
    if (kept.some((seen) => sameService(seen, service))) continue;
    kept.push(service);
  }
  return kept;
}

export interface EndpointServices {
  camping: NearbyService[];
  rentals: NearbyService[];
}

export interface EndpointGroups {
  putIn: EndpointServices;
  takeOut: EndpointServices;
}

/** Just the field this file reads off a detail response. Structural, see tabs.ts. */
interface DetailLike {
  accessPoint?: { nearbyServices?: NearbyService[] | null } | null;
}

/**
 * The services explicitly associated with each end of the float.
 *
 * ── A NULL DETAIL IS A FIRST-CLASS INPUT ──────────────────────────────────
 * It means one of three things and the answer is the same for all of them: the
 * request failed, the plan carried no slug to build a route from (shared floats
 * often do not), or the access point genuinely lists nothing. A plan with one
 * endpoint group is still a plan, so this returns empty groups rather than
 * throwing, and the caller renders whichever headings have rows.
 *
 * ── PUT-IN WINS A TIE ─────────────────────────────────────────────────────
 * An outfitter listed against both ends is one business, and it is shown once,
 * at the end the reader gets to first. Showing it twice under two headings is
 * the duplication the map sheet's own service split exists to prevent.
 *
 * Lodging is deliberately absent. This is the strip that answers "who can help
 * me run this float"; where to sleep is the access sheet's question and has its
 * own section there, with an Airbnb search under it.
 */
export function groupEndpointServices(
  putInDetail: DetailLike | null,
  takeOutDetail: DetailLike | null,
): EndpointGroups {
  const putIn = endpointServices(putInDetail);
  const takeOut = endpointServices(takeOutDetail);

  return {
    putIn,
    takeOut: {
      camping: dedupe(takeOut.camping, putIn.camping),
      rentals: dedupe(takeOut.rentals, putIn.rentals),
    },
  };
}

function endpointServices(detail: DetailLike | null): EndpointServices {
  const services = detail?.accessPoint?.nearbyServices ?? [];
  const inTier = (tier: 'camping' | 'rentals') =>
    // The same rule the map layers ask, so a business is classified once for
    // the whole app. Embedded entries carry a `type` and no `servicesOffered`,
    // which falls through to serviceTiers' kind floor — what that floor is for.
    dedupe(services.filter((service) => serviceTiers(service).includes(tier)));

  return { camping: inTier('camping'), rentals: inTier('rentals') };
}

/** Three is a shortlist. More than that is a directory, and this is not one. */
export const MAX_NEARBY_SHUTTLES = 3;

export interface RankedShuttle {
  service: RiverService;
  miles: number;
}

/**
 * The nearest shuttles the endpoint groups did not already name.
 *
 * Lifted unchanged from PlanNearby except for `exclude`, which is the whole
 * point of keeping it: a provider already shown under "Near the put-in" must
 * not appear again below it with a mileage attached, as though it were a second
 * option.
 *
 * ── `serviceOffers`, NOT `serviceTiers` ───────────────────────────────────
 * A tier unions the kind in as a floor, so every outfitter is in `rentals`
 * whether or not it shuttles anybody — right for a map layer, wrong for a
 * heading that names one capability. Asking the tier here recommended all 71
 * outfitters, three of which shuttle nobody.
 *
 * Contactability is required and stays local to this function: a recommendation
 * needs a way to act on it, where a pin does not.
 */
export function rankNearbyShuttles(
  services: readonly RiverService[],
  from: { lat: number; lng: number },
  distance: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number,
  exclude: readonly ServiceLike[] = [],
  max: number = MAX_NEARBY_SHUTTLES,
): RankedShuttle[] {
  return services
    .filter(
      (service) =>
        serviceOffers(service, 'shuttle') &&
        // A closed business is worse than none, and this is a recommendation
        // with a mileage on it.
        serviceEligible(service) &&
        mappableService(service) &&
        service.latitude != null &&
        service.longitude != null &&
        // A row with no way to reach it is a name, not a contact.
        (service.phone || service.website) &&
        !exclude.some((shown) => sameService(shown, service)),
    )
    .map((service) => ({
      service,
      miles: distance(from, {
        lat: service.latitude as number,
        lng: service.longitude as number,
      }),
    }))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, max);
}

/**
 * How to reach a service: the phone if there is one, else the website.
 *
 * Phone first, which is the rule the whole app follows — at a put-in on one bar
 * of signal a number you can tap beats a page you have to load. A row with
 * neither gets no action rather than an action that does nothing.
 *
 * Duplicated in shape, not in substance, from AccessTabs' `serviceUrl`: that
 * one takes a NearbyService and this takes anything with the two fields, which
 * is what lets a directory row and an embedded entry share one contact rule.
 */
export function serviceContactUrl(service: ServiceLike): string | null {
  if (service.phone) return `tel:${service.phone.replace(/[^\d+]/g, '')}`;
  if (!service.website) return null;
  return /^https?:\/\//i.test(service.website) ? service.website : `https://${service.website}`;
}
