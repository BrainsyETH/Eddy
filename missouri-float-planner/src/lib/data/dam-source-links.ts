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
//   Ameren   ameren.com/reliability/generation/hydro/reports/osage/bagnell-daily-report
//            "Harry S. Truman and Bagnell Dam Daily Report": the page that
//            carries the Truman pool and outflow Eddy shows.
//
// ── Why these are registry facts and not derived from the response ─────────
// `sources` on the snapshot follows what THIS read returned, because it is
// attribution for numbers on screen. A link is different: when a read fails and
// the card says "unavailable", the publisher's page is the useful thing left.
// So a link is sent whenever the registry says the page exists.
//
// ── A link beside a reading IS attribution ─────────────────────────────────
// Whatever its label says, a link placed directly under a number reads as
// "this is where that number came from". So the `readings` link follows the
// path the readings actually take, exactly as `sources` does: Ameren's report
// for the two dams read from Ameren, the Corps' page for everything read from
// CWMS.
//
// Truman is where the two part. It is a Corps dam whose readings reach Eddy
// through Ameren's daily report, so its `readings` link is that report, and
// the Corps' own page for the project is sent as a `reference`: offered among
// the page's other onward links, not under a number it did not supply.
//
// Stockton keeps the Corps page as `readings` although Eddy reads nothing for
// it. There is no number there to misattribute, and the Corps page is where
// its readings are.
//
// Hosts are pinned (SOURCE_LINK_HOSTS) and the test holds every emitted URL to
// them, because these strings are opened by a shipped app on a server's say-so.

import type { DamSourceLink } from '@shared/dam-types';
import type { UsaceDam } from '@/lib/flow-providers/usace-registry';

const USACE_WATER_BASE = 'https://water.usace.army.mil/overview';
export const SWPA_SCHEDULES_URL = 'https://www.energy.gov/swpa/generation-schedules';
export const AMEREN_OSAGE_REPORTS_URL = 'https://www.ameren.com/property/lake-of-the-ozarks/reports';
export const AMEREN_DAILY_REPORT_URL =
  'https://www.ameren.com/reliability/generation/hydro/reports/osage/bagnell-daily-report';

/** The only hosts a dam source link may name. */
export const SOURCE_LINK_HOSTS = ['water.usace.army.mil', 'www.energy.gov', 'www.ameren.com'] as const;

/** `swl/bull_shoals_dam` → the Corps' page for that project. */
export function usaceWaterPageUrl(page: string): string {
  const [district, slug] = page.split('/');
  return `${USACE_WATER_BASE}/${district}/locations/${slug}`;
}

/**
 * The links for one dam: the source of its readings, then its schedule, then
 * the operator's page where that is not already the readings link.
 * At most one of each kind, which is what lets a surface place them by kind.
 */
export function damSourceLinks(dam: UsaceDam): DamSourceLink[] {
  const links: DamSourceLink[] = [];
  const corpsPage = dam.usaceWaterPage
    ? {
        label: 'Corps of Engineers data',
        publisher: 'U.S. Army Corps of Engineers',
        url: usaceWaterPageUrl(dam.usaceWaterPage),
      }
    : null;

  // Readings: the publisher of the numbers on the card. The same branch
  // buildSnapshot takes for `sources` — amerenMetrics first, CWMS otherwise.
  if (dam.amerenMetrics === 'truman') {
    links.push({
      kind: 'readings',
      label: 'Ameren daily report',
      publisher: 'Ameren Missouri',
      url: AMEREN_DAILY_REPORT_URL,
    });
  } else if (dam.amerenMetrics === 'osage') {
    links.push({
      kind: 'readings',
      label: 'Ameren lake reports',
      publisher: 'Ameren Missouri',
      url: AMEREN_OSAGE_REPORTS_URL,
    });
  } else if (corpsPage) {
    links.push({ kind: 'readings', ...corpsPage });
  }

  if (dam.swpaCode) {
    links.push({
      kind: 'schedule',
      label: 'SWPA schedule',
      publisher: 'Southwestern Power Administration',
      url: SWPA_SCHEDULES_URL,
    });
  }

  // The operator's page, when the readings came from somebody else.
  if (corpsPage && dam.amerenMetrics) links.push({ kind: 'reference', ...corpsPage });
  return links;
}
