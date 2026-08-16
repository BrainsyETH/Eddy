// src/lib/service-tiers.ts
// Which sections a directory service belongs to, for the river page.
//
// ── A MIRROR OF @eddy/types, AND WHY IT HAS TO BE ONE ──────────────────────
//
// Vercel's root directory is missouri-float-planner/, so shippable web code
// cannot import from packages/ — see CLAUDE.md. The app's copy of this is
// `serviceTiers` in packages/eddy-types, and it is the original; this is the
// half the website can reach. `service-tier-parity.test.ts` runs both over
// every type and every offering and fails if they ever disagree, which is the
// same arrangement src/types/api.ts has with the wire types.
//
// Do not "simplify" this by importing the package. The build will resolve it
// under tsconfig.test.json and then fail on Vercel, where packages/ is not
// there at all.
//
// ── WHY THE WEBSITE NEEDED IT ──────────────────────────────────────────────
//
// The river page grouped its directory by `type` alone — one bucket per row,
// mutually exclusive. The app had already stopped doing that, because the
// exclusivity was the defect: a campground that rents cabins is an answer to
// "where can I sleep under a roof" AND to "where can I pitch a tent", and a
// business filed under one of them is invisible to somebody asking the other.
//
// So the same campground appeared under Cabins & lodges in the app and only
// under Campgrounds on the website, from one row in one table. The app's model
// is the current one; this brings the page to it.

/** The website's own offering vocabulary lives in src/types/api.ts. */
import type { NearbyServiceDirectoryType, ServiceOffering } from '@/types/api';

/**
 * What a reader is looking for, which is never "a row of type cabin_lodge".
 *
 * Named for the INTENT rather than the business — somebody wants a boat, a
 * patch of ground, or a roof — because that is the only grouping that survives
 * a business offering all three.
 */
export type ServiceTier = 'rentals' | 'camping' | 'lodging';

/** Offerings that put a service in a tier, whatever kind of business it is. */
const TIER_OFFERINGS = {
  rentals: [
    'canoe_rental',
    'kayak_rental',
    'raft_rental',
    'tube_rental',
    'jon_boat_rental',
    'shuttle',
  ],
  camping: ['camping_primitive', 'camping_rv'],
  lodging: ['cabins', 'lodge_rooms'],
} satisfies Record<ServiceTier, ServiceOffering[]>;

/**
 * The tier a service gets from WHAT IT IS, when its capabilities do not say.
 *
 * Keyed by the website's `NearbyServiceDirectoryType`, which is the narrower of
 * the two vocabularies — the app also knows `canoe_rental`, `shuttle` and
 * `lodging`, which this API never emits. The parity test covers those too, by
 * asking this function about them as raw strings.
 */
const KIND_TIER = {
  outfitter: 'rentals',
  campground: 'camping',
  cabin_lodge: 'lodging',
} satisfies Record<NearbyServiceDirectoryType, ServiceTier>;

/** The app's wider kind vocabulary, for rows this API does not currently emit. */
const EXTRA_KIND_TIER: Record<string, ServiceTier> = {
  canoe_rental: 'rentals',
  shuttle: 'rentals',
  lodging: 'lodging',
};

export const TIER_ORDER: ServiceTier[] = ['rentals', 'camping', 'lodging'];

/**
 * Every tier this service belongs to.
 *
 * ── A SET, NOT ONE VALUE, AND THAT IS THE WHOLE POINT ─────────────────────
 *
 * Returning a single group would encode the mutual exclusivity that is the
 * original defect. An outfitter that rents cabins belongs under rentals AND
 * lodging; asking it to pick loses a real answer to a real question.
 *
 * ── Capability first, KIND AS THE FLOOR ───────────────────────────────────
 *
 * The kind's tier is always unioned in and never overridden. Not
 * belt-and-braces: campgrounds in the directory record `showers` and
 * `boat_ramp` but no `camping_*` offering at all, so a capability-PURE camping
 * tier would silently drop them. Capability data is dense but tier membership
 * needs completeness, and only the kind has that.
 *
 * ── Never empty ───────────────────────────────────────────────────────────
 *
 * An unrecognised type still lands in `rentals`, because a service Eddy cannot
 * classify is better shown under a broad heading than not shown at all.
 */
export function serviceTiers(service: {
  type: string;
  servicesOffered?: readonly string[] | null;
}): ServiceTier[] {
  const tiers = new Set<ServiceTier>();

  const offerings = service.servicesOffered ?? [];
  for (const tier of TIER_ORDER) {
    if (offerings.some((o) => (TIER_OFFERINGS[tier] as readonly string[]).includes(o))) {
      tiers.add(tier);
    }
  }

  // The floor. Unioned in, never overriding — see the header.
  const known =
    (KIND_TIER as Record<string, ServiceTier>)[service.type] ?? EXTRA_KIND_TIER[service.type];
  tiers.add(known ?? 'rentals');

  return TIER_ORDER.filter((tier) => tiers.has(tier));
}

/**
 * The river page's sections, in the app's order.
 *
 * Camping before lodging, rentals first: the app's SERVICE_SECTIONS puts
 * Campgrounds, then Rentals & shuttles, then Cabins & lodges, having moved
 * lodging up beside camping because "a roof rather than a tent" is an answer to
 * the question camping asks. The website keeps its own long-standing order
 * (outfitters lead the section titled "Outfitters & Services") — the grouping
 * is what had to converge, not the running order.
 */
export const SERVICE_TIER_LABELS: Record<ServiceTier, string> = {
  rentals: 'Outfitters',
  camping: 'Campgrounds',
  lodging: 'Cabins & Lodges',
};

/**
 * Whether Eddy should show this business at all.
 *
 * ── Deliberately NOT part of serviceTiers ─────────────────────────────────
 * Classification answers "what is this", eligibility answers "should we send
 * anyone here", and the package's copy keeps them apart for the same reason:
 * classification must never decide whether something is safe to recommend.
 *
 * ── What went wrong without it ────────────────────────────────────────────
 * The app filtered on this and the website did not, from the same rows on the
 * same wire. A `permanently_closed` outfitter vanished from the river sheet on
 * a phone and kept its card — with a tappable phone number — on eddy.guide. A
 * closed business excluded from the map only by the accident of having no
 * coordinates was still in the list.
 *
 * `temporarily_closed` is excluded alongside it: a business shut for the
 * season is not one to hand somebody standing at a put-in today.
 *
 * ABSENT MEANS ELIGIBLE. Most rows say nothing about status, and "not told" is
 * the overwhelmingly common case — treating silence as closed would empty the
 * directory. Mirrors `serviceEligible` in packages/eddy-types; parity is
 * covered by service-tier-parity.test.ts.
 */
export function serviceEligible(service: { status?: string | null }): boolean {
  const status = service.status;
  return status !== 'permanently_closed' && status !== 'temporarily_closed';
}
