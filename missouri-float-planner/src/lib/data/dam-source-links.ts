// src/lib/data/dam-source-links.ts
// The publishers' own pages for a dam's data, as the links a dam card offers.
//
// Every number on a dam card is somebody else's: the Corps measures the
// release, Southwestern Power Administration posts the generation schedule,
// Ameren reports Bagnell. This builds the link from each half of the card to
// the page it came from, so a reader can check Eddy against the source and
// still has somewhere to go when a feed is down.
//
// ── What a link points at ──────────────────────────────────────────────────
// The page a PERSON reads, never the endpoint Eddy calls. The CWMS Data API
// and Ameren's hydro API answer JSON, and SWPA's per-day files are fixed-width
// text for twenty-odd projects keyed by column code; none of those is where a
// reader should land.
//
//   Corps    water.usace.army.mil/overview/<district>/locations/<slug>
//            One page per project: pool, release, tailwater and their charts.
//            The slug is declared per dam in the registry (usaceWaterPage).
//   SWPA     energy.gov/swpa/generation-schedules
//            The index of the seven day sheets, not a sheet. A day's file name
//            is a weekday, so a link to "today's" goes wrong at midnight on any
//            payload a phone is still holding; the index cannot.
//   Ameren   ameren.com/property/lake-of-the-ozarks/reports
//            The Lake of the Ozarks report index. Bagnell is a licensed private
//            project with no federal data page, so its operator's is the source.
//
// ── Why these are registry facts and not derived from the response ─────────
// `sources` on the snapshot follows what THIS read returned, because it is
// attribution for numbers on screen. A link is different: when a read fails and
// the card says "unavailable", the publisher's page is the useful thing left.
// So a link is sent whenever the registry says the page exists.
//
// Truman is the one project whose readings Eddy takes from somebody other than
// its operator (Ameren's daily report carries them). Its link is still the
// Corps page: that is the operator's own record of the dam, and the label names
// the destination rather than claiming where a particular number came from.
//
// Hosts are pinned (SOURCE_LINK_HOSTS) and the test holds every emitted URL to
// them, because these strings are opened by a shipped app on a server's say-so.

import type { DamSourceLink } from '@shared/dam-types';
import type { UsaceDam } from '@/lib/flow-providers/usace-registry';

const USACE_WATER_BASE = 'https://water.usace.army.mil/overview';
export const SWPA_SCHEDULES_URL = 'https://www.energy.gov/swpa/generation-schedules';
export const AMEREN_OSAGE_REPORTS_URL = 'https://www.ameren.com/property/lake-of-the-ozarks/reports';

/** The only hosts a dam source link may name. */
export const SOURCE_LINK_HOSTS = ['water.usace.army.mil', 'www.energy.gov', 'www.ameren.com'] as const;

/** `swl/bull_shoals_dam` → the Corps' page for that project. */
export function usaceWaterPageUrl(page: string): string {
  const [district, slug] = page.split('/');
  return `${USACE_WATER_BASE}/${district}/locations/${slug}`;
}

/**
 * The links for one dam: its operator's readings first, then the schedule.
 * At most one of each kind, which is what lets a card place them by kind.
 */
export function damSourceLinks(dam: UsaceDam): DamSourceLink[] {
  const links: DamSourceLink[] = [];
  if (dam.usaceWaterPage) {
    links.push({
      kind: 'readings',
      label: 'Corps of Engineers data',
      publisher: 'U.S. Army Corps of Engineers',
      url: usaceWaterPageUrl(dam.usaceWaterPage),
    });
  } else if (dam.amerenMetrics === 'osage') {
    links.push({
      kind: 'readings',
      label: 'Ameren lake reports',
      publisher: 'Ameren Missouri',
      url: AMEREN_OSAGE_REPORTS_URL,
    });
  }
  if (dam.swpaCode) {
    links.push({
      kind: 'schedule',
      label: 'SWPA schedule',
      publisher: 'Southwestern Power Administration',
      url: SWPA_SCHEDULES_URL,
    });
  }
  return links;
}
