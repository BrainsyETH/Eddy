// eddy-ios/src/lib/accessCopy.ts
// Wording for an access point's detail fields.
//
// The detail endpoint returns raw column values — 'gravel_unmaintained', '50+',
// 'COE' — because it serves a web page that has its own label maps. The phone
// needs the same words, and inventing them at each call site is how the same
// road surface ends up reading two ways on two screens.

import type { ManagingAgency, ParkingCapacity, RoadSurface } from '@eddy/types';

const ROAD_SURFACE_LABELS: Record<RoadSurface, string> = {
  paved: 'Paved',
  gravel_maintained: 'Maintained gravel',
  gravel_unmaintained: 'Unmaintained gravel',
  dirt: 'Dirt',
  seasonal: 'Seasonal road',
  '4wd_required': '4WD required',
};

/**
 * Which surfaces mean "check your vehicle before you commit".
 *
 * A separate question from the label, and the reason this file exists rather
 * than a lookup inline: "Unmaintained gravel" and "4WD required" are the two
 * answers that change whether somebody should tow a trailer down there, and a
 * screen that renders all six surfaces in identical grey text has stated the
 * fact without communicating it.
 */
const DEMANDING_SURFACES: RoadSurface[] = ['gravel_unmaintained', 'dirt', '4wd_required'];

export function roadSurfaceLabel(surface: string): string {
  return ROAD_SURFACE_LABELS[surface as RoadSurface] ?? surface.replace(/_/g, ' ');
}

export function isDemandingSurface(surface: string): boolean {
  return DEMANDING_SURFACES.includes(surface as RoadSurface);
}

const AGENCY_LABELS: Record<ManagingAgency, string> = {
  MDC: 'Missouri Dept. of Conservation',
  NPS: 'National Park Service',
  USFS: 'U.S. Forest Service',
  COE: 'Army Corps of Engineers',
  'State Park': 'State Park',
  County: 'County',
  Municipal: 'Municipal',
  Private: 'Privately managed',
};

export function agencyLabel(agency: string): string {
  return AGENCY_LABELS[agency as ManagingAgency] ?? agency;
}

/**
 * "Parking for 20", "Roadside parking", "Limited parking".
 *
 * The bucket values are words and the rest are counts, so this cannot simply
 * template a number in — '50+' and 'roadside' would come out as "Parking for
 * roadside".
 */
export function parkingLabel(capacity: ParkingCapacity | string | null): string | null {
  if (!capacity || capacity === 'unknown') return null;
  if (capacity === 'roadside') return 'Roadside parking';
  if (capacity === 'limited') return 'Limited parking';
  return `Parking for ${capacity}`;
}

/**
 * TipTap HTML down to something a <Text> can hold.
 *
 * `localTips` is authored in the admin's rich-text editor and arrives as HTML.
 * There is no HTML renderer in this app, and adding react-native-render-html
 * for one optional field on one screen is a native-adjacent dependency bought
 * for a paragraph of prose.
 *
 * So it is flattened, and flattened CONSERVATIVELY: block tags become newlines
 * so paragraphs and list items stay separate lines, list items keep a bullet,
 * and everything else is dropped. The alternative — a bare tag strip — runs
 * three paragraphs of local knowledge together into one wall.
 *
 * Entities are decoded for the five that actually appear in prose. This is not
 * a general-purpose decoder and must not be used as one; it exists to keep
 * "Bob&#39;s Landing" from rendering with its escape visible.
 */
export function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;

  const text = html
    // A list item is a line AND a bullet — dropping the marker turns a list of
    // three warnings into one run-on sentence.
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    // Block tags nest, so the replacements above stack up runs of newlines.
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  return text.length > 0 ? text : null;
}

/**
 * What Overview opens with when the place has no description.
 *
 * ── THE LANDING TAB WAS ROUTINELY ONE LINK ───────────────────────────────
 *
 * Overview is description + Water (only with a gauge) + Camping nearby (only
 * with a campground service) + the river row. 81 of Eddy's 406 access points
 * have no description at all, so a put-in with no gauge on its reach landed the
 * reader on a single link and nothing else — which does not read as "Eddy knows
 * little about this place", it reads as broken.
 *
 * The fix is not invented copy. Of those 81, EIGHTY carry a fact already in the
 * same response — road access, parking, facilities, or somebody's river notes.
 * Overview was empty not because Eddy knows nothing but because everything it
 * knows was filed one tab to the right. Exactly one access point in the database
 * is genuinely bare.
 *
 * ── The order is what a stranger needs first ─────────────────────────────
 *
 * How you get in leads: it is the most useful sentence about a put-in you have
 * never driven to, and it is the one most likely to change whether you go.
 * Parking, then facilities, then local notes.
 *
 * ── Returned as prose, and the caller draws it with no heading ───────────
 *
 * It goes in the description's own slot. It is the same kind of sentence in the
 * same place, and a heading over it — "Getting in", borrowed from Place — would
 * be Eddy explaining its own data model to somebody who asked about a river. The
 * fact keeps its structured home on Place; this is duplication across a swipe
 * rather than within a glance, which is the trade Overview's Water block already
 * makes and defends.
 */
export function overviewLead(
  point: {
    description?: string | null;
    roadAccess?: string | null;
    parkingInfo?: string | null;
    facilities?: string | null;
    localTips?: string | null;
  } | null,
): string | null {
  if (!point) return null;
  // A description means there is nothing to promote — this is a fallback, never
  // a supplement. Two paragraphs saying overlapping things is how the Place tab
  // came to be a junk drawer in the first place.
  if (nonEmpty(point.description)) return null;

  return (
    nonEmpty(point.roadAccess) ??
    nonEmpty(point.parkingInfo) ??
    nonEmpty(point.facilities) ??
    // Last because it is the least predictable in register — local tips are
    // somebody's notes rather than a fact about the place — and HTML, which is
    // why it is the one field that has to be stripped.
    stripHtml(point.localTips)
  );
}

/** Trimmed, or null. A column holding '' or '   ' is a column holding nothing. */
function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

/**
 * What a tab says while it has nothing, told apart by WHY.
 *
 * "Unavailable" on a request still in flight tells the reader to give up on
 * something that is about to arrive; a spinner on a request that already failed
 * asks them to wait for something that never will. Restrained on purpose —
 * neither case is an error the reader caused or can do anything about.
 *
 * ── MOVED HERE FROM AccessTabs.tsx, so it can be tested ──────────────────
 *
 * It is a string derived from a status and nothing else, and it lived in a
 * component the web suite cannot import — that suite being the only runner the
 * Expo app has. The distinction below then went un-guarded long enough for the
 * tab-level empty line to be written WITHOUT it, reporting a failed request as
 * "Eddy has no description for this place": a claim about the data made from a
 * failure to load it. That is the case the tests now pin.
 *
 * `status` is structural rather than the imported DetailStatus for the reason
 * `tabs.ts` gives for LayerTapped: an app-path import fails under the web
 * suite's tsconfig, which resolves `@/*` to its own src/.
 */
export function waitingCopy(
  status: 'idle' | 'loading' | 'ready' | 'failed',
  subject: string,
): string {
  if (status === 'loading') return `Loading ${subject}…`;
  if (status === 'failed') return `${sentence(subject)} unavailable right now.`;
  // ── SETTLED, AND NOTHING IS COMING ──────────────────────────────────────
  // 'idle' means no request was ever made — the pin carries no detail route —
  // and 'ready' here means one was made and came back without an access point.
  // Both used to fall through to "Loading…", which is a promise this tab cannot
  // keep: the spinner-less wait never ends, and a reader watching it has no way
  // to learn that. This is the reported bug.
  return `Eddy has no ${subject} for this place.`;
}

/** Capitalised for the start of a sentence, since the subjects are noun phrases. */
function sentence(subject: string): string {
  return subject.charAt(0).toUpperCase() + subject.slice(1);
}
