// eddy-ios/src/components/map-sheet/tabs.ts
// Which tabs a given pin gets, and which one it opens on.
//
// ── A FUNCTION, not a Record<LayerKey, Tab[]> ─────────────────────────────
// A table keyed by layer would be smaller and would be wrong. The same layer
// yields different tab sets depending on the place: an access point earns a
// Camping tab only when it camps, and a Float trips tab only when it has
// neighbours to float to. Dams are the extreme case — Stockton publishes
// nothing to CWMS and has no tailwater, so it has strictly less to say than
// Clearwater does, from the same layer.
//
// ── The tab set GROWS, and not only on the right ──────────────────────────
// The detail request lands after the sheet is already open, so a sheet that
// starts with one tab may finish with three — and because the order below is
// fixed, a late arrival INSERTS. A campground pin opens on [Overview, Camping]
// and becomes [Overview, Float trips, Camping] the moment the request settles,
// which moves Camping from index 1 to index 2.
//
// So THE ACTIVE TAB MUST BE TRACKED BY KEY, NEVER BY INDEX. A reader sitting
// on Camping at index 1 would otherwise find themselves reading Conditions a
// second later, without having touched anything. See PinSheet.
//
// ── Absent, never empty ───────────────────────────────────────────────────
// A tab with nothing behind it is worse than no tab: it is a promise the sheet
// cannot keep, and the reader pays a swipe to find that out.
import type { AccessPointDetailResponse, MapAccessPoint } from '@eddy/types';
import { isCampground } from '@eddy/types';
import { accessRoleForLayer } from '../../map/accessLayers';
import { accessAvailability } from './availabilitySource';

/**
 * Just the field the landing rule reads.
 *
 * Structural rather than importing MapPin, and not only for tidiness: the web
 * test suite type-checks this file (the Expo app has no runner of its own) and
 * resolves `@/*` to its OWN src/, so an app-path import fails there while tsx
 * erases it and the tests still pass. See tsconfig.test.json's header.
 */
interface LayerTapped {
  layer: string;
}

/**
 * ── THERE IS NO `conditions` KEY ANY MORE ─────────────────────────────────
 *
 * The peek carries the reading — see peekSlot.ts — and the tab was reached by
 * swiping down from a sheet that was already showing it. What the tab added on
 * top was a trend, a timestamp and an "Open gauge" row duplicating the tap
 * target the reading block already was: a whole destination for two facts and a
 * second copy of one link. The two facts are on Overview now.
 *
 * ── AND THERE IS NO `details` KEY ('Place') EITHER ────────────────────────
 *
 * It went the same way and for the same reason. Place held road surface,
 * parking, facilities, outfitters, lodging and river notes; Overview held the
 * description, the water and camping. Nothing about that split was legible from
 * the outside — both tabs answered "what is this place", so which one held a
 * given fact was a coin toss the reader had to pay a swipe to resolve. Worse,
 * the split was what forced `hasPlaceTab`: whichever tab existed had to take
 * custody of the link to the full detail screen, so a link's presence depended
 * on a tab's existence.
 *
 * Overview holds all of it now, in one scroll, in the order somebody standing
 * in a driveway asks: what is this, what is the water doing, can I get down
 * there, can I park, what is there, where do I sleep, who rents boats, anything
 * else. The duplication risk the split was meant to solve is handled where it
 * belongs — `servicesByTier` partitions camping out of rentals and lodging, so
 * a campground can only appear once no matter how many sections render.
 */
export type TabKey = 'overview' | 'floats' | 'camping';

export interface TabDef {
  key: TabKey;
  label: string;
}

const LABELS: Record<TabKey, string> = {
  overview: 'Overview',
  floats: 'Float trips',
  camping: 'Camping',
};

/**
 * Fixed order, always. Camping is INSERTED at its place rather than promoted to
 * the front for a campground pin, because a tab bar whose second entry is
 * "Conditions" on one pin and "Camping" on the next has no muscle memory to
 * offer — and you tap a lot of pins in one session. Intent is honoured by which
 * tab the sheet OPENS on instead; see initialTabKey.
 */
const ORDER: TabKey[] = ['overview', 'floats', 'camping'];

export function accessTabs(
  accessPoint: MapAccessPoint,
  detail: AccessPointDetailResponse | null,
): TabDef[] {
  const point = detail?.accessPoint ?? null;
  const keys = new Set<TabKey>(['overview']);

  // Before the request lands there is nothing to qualify on, so the sheet opens
  // with Overview alone and grows. See the header for why that growth inserts.
  if (detail?.nearbyAccessPoints?.length) keys.add('floats');

  // ── Three legs ───────────────────────────────────────────────────────────
  // isCampground() reads the TYPE TAGS and knows nothing about any campground
  // record; npsCampground is the record and exists only for NPS sites; and
  // `availability` is live inventory, which a place can have without being
  // either. Any one alone would miss real campgrounds, so all three are asked.
  //
  // The third leg used to be unwritable. A Missouri State Park — Meramec,
  // Onondaga Cave, Washington — has no nps_campgrounds row, but
  // campsite_facilities carries live availability for it through its OTHER
  // foreign key, and the API nested `availability` INSIDE npsCampground, so
  // "has availability but is not NPS" was unrepresentable rather than merely
  // absent. Such a site got the tab only when it happened to be tagged
  // 'campground' — the common case, but a tag away from being missed, while
  // NPS sites looked fine the whole time. The server lifts the field to a
  // sibling now; this is that one line.
  const camps =
    isCampground(accessPoint) || point?.npsCampground != null || accessAvailability(point) != null;
  if (camps) keys.add('camping');

  return ORDER.filter((key) => keys.has(key)).map((key) => ({ key, label: LABELS[key] }));
}

/**
 * Which tab to land on.
 *
 * Tapping a TENT and being shown a put-in's road surface is answering a
 * question nobody asked. The access family presents the very same access point
 * under whichever of its marks won — RiverMap keeps the canonical `access:{id}`
 * identity while doing it — so `pin.layer` is a clean record of which icon the
 * finger actually landed on.
 *
 * ── THE ROLE, not the layer key ──────────────────────────────────────────
 *
 * The question is "did they tap a camping mark", and it was being asked as
 * `pin.layer === 'campgrounds'` — a fact about the map standing in for a fact
 * about intent. Asked through the role vocabulary it survives a fourth access
 * mark: a boat ramp resolves to `boatRamp` and lands on Overview, which is
 * right, and it does so because the rule says what it means rather than because
 * a string happened not to match.
 *
 * ── WHY THE LAYER IS NOT ENOUGH ON ITS OWN ───────────────────────────────
 *
 * Campgrounds ships ON (see LAYER_DEFAULTS), and MARK_PRIORITY puts campground
 * first, so the campgrounds layer CLAIMS every access point that also camps —
 * Akers, Cedargrove, Red Bluff, Meramec State Park. Those pins are built with
 * `layer: 'campgrounds'`, so the role test read them as a tent tap and opened
 * every one of them on Camping. Out of the box, a reader tapping the put-in
 * they float from got the campsite list and had to swipe back to find the
 * water. The signal was never intent; it was which layer happened to own the
 * marker, which changes under the reader as they toggle layers.
 *
 * So the tent tap is honoured only for a place that is ONLY a tent.
 * `isFloatEndpoint` is the question already written for this: a state park or
 * campground with no ramp is a real place with a real page and no launch. If
 * you can start a float here, this is a put-in that happens to camp, and
 * Overview is what you came for.
 *
 * `=== false`, never a falsy check — ABSENT MEANS ELIGIBLE, so a payload
 * cached before the field existed lands on Overview, which is the safe
 * direction. See MapAccessPoint.isFloatEndpoint in @eddy/types.
 *
 * Falls back to 0 whenever the preferred tab is not in the set, including
 * during the window before the detail request has qualified it.
 */
export function initialTabKey(
  tabs: TabDef[],
  pin: LayerTapped,
  accessPoint?: MapAccessPoint | null,
): TabKey | null {
  const tapped = accessRoleForLayer(pin.layer);
  const campgroundOnly = accessPoint?.isFloatEndpoint === false;
  if (tapped === 'campground' && campgroundOnly && tabs.some((tab) => tab.key === 'camping')) {
    return 'camping';
  }
  return tabs[0]?.key ?? null;
}

/** Convenience for callers that want a position rather than an identity. */
export function initialTabIndex(
  tabs: TabDef[],
  pin: LayerTapped,
  accessPoint?: MapAccessPoint | null,
): number {
  const key = initialTabKey(tabs, pin, accessPoint);
  return Math.max(0, tabs.findIndex((tab) => tab.key === key));
}
