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
