// scripts/check-dam-source-links.ts
// Confirm that every publisher page a dam card links to still exists.
//
//   npx tsx scripts/check-dam-source-links.ts            # every dam
//   npx tsx scripts/check-dam-source-links.ts swl-bull-shoals-dam
//
// Read-only: it issues GETs to three public sites and writes nothing.
// Deliberately NOT in the `test` script — it needs the network, and CI has to
// stay hermetic. Run it by hand when adding a dam, changing a `usaceWaterPage`,
// or when somebody reports a dead link. The hermetic half of this contract
// (hosts, scheme, one link per kind, every dam covered) is
// src/lib/data/dam-source-links.test.ts.
//
// WHY A SCRIPT AND NOT A LINK CHECKER. The Corps' water-data site is a
// single-page app: it answers 200 for ANY path and draws "404 - Location Not
// Found" in the page afterwards. So a wrong slug looks healthy to anything
// that reads a status code. What does tell the truth is the list the site
// itself builds its pages from — /cda/reporting/providers/<district>/locations
// — so each registered page is checked against that list by its `slug`.
//
// SWPA's schedule index and Ameren's report index are ordinary pages and are
// checked by status and by a phrase that only the real page carries, so a
// redirect to a homepage does not pass.

import { USACE_DAMS } from '../src/lib/flow-providers/usace-registry';
import {
  AMEREN_OSAGE_REPORTS_URL,
  SWPA_SCHEDULES_URL,
  damSourceLinks,
} from '../src/lib/data/dam-source-links';

const TIMEOUT_MS = 30_000;
// Ameren's site refuses clients with no browser-like agent. Generic on
// purpose: these are other people's logs.
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; link-check)', Accept: 'text/html,application/json' };

interface WaterLocation {
  slug: string;
  kind: string;
  public_name: string | null;
}

async function get(url: string): Promise<Response> {
  return fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
}

const districtLocations = new Map<string, Promise<WaterLocation[]>>();
function locationsFor(district: string): Promise<WaterLocation[]> {
  let pending = districtLocations.get(district);
  if (!pending) {
    pending = (async () => {
      const response = await get(`https://water.usace.army.mil/cda/reporting/providers/${district}/locations`);
      if (!response.ok) throw new Error(`location list answered ${response.status}`);
      return (await response.json()) as WaterLocation[];
    })();
    districtLocations.set(district, pending);
  }
  return pending;
}

async function checkPage(url: string, mustContain: RegExp): Promise<string | null> {
  const response = await get(url);
  if (!response.ok) return `answered ${response.status}`;
  if (new URL(response.url).pathname !== new URL(url).pathname) return `redirected to ${response.url}`;
  return mustContain.test(await response.text()) ? null : `no longer reads as the expected page (${mustContain})`;
}

async function main(): Promise<void> {
  const only = process.argv.slice(2);
  const dams = Object.values(USACE_DAMS).filter((dam) => only.length === 0 || only.includes(dam.id));
  if (dams.length === 0) {
    console.error(`No registered dam matches: ${only.join(', ')}`);
    process.exit(2);
  }

  let failures = 0;
  const fail = (subject: string, problem: string) => {
    failures += 1;
    console.log(`FAIL  ${subject}: ${problem}`);
  };

  for (const dam of dams) {
    const links = damSourceLinks(dam);
    if (!links.some((link) => link.kind === 'readings')) fail(dam.id, 'no readings link');
    if (!dam.usaceWaterPage) continue;
    const [district, slug] = dam.usaceWaterPage.split('/');
    try {
      const match = (await locationsFor(district)).find((location) => location.slug === slug);
      if (!match) fail(dam.id, `the Corps lists no location "${slug}" in ${district.toUpperCase()}`);
      // A stream gauge that happens to share a name is not the project's page.
      else if (match.kind !== 'PROJECT') fail(dam.id, `"${slug}" is a ${match.kind}, not the project (${match.public_name})`);
      else console.log(`ok    ${dam.id} → ${match.public_name}`);
    } catch (error) {
      fail(dam.id, `could not read the ${district.toUpperCase()} location list (${(error as Error).message})`);
    }
  }

  // The two shared pages, once each, if any selected dam links to them.
  const shared: Array<[string, string, RegExp]> = [
    ['SWPA schedule index', SWPA_SCHEDULES_URL, /swpa\/(mon|tue|wed|thu|fri|sat|sun)\.htm/i],
    ['Ameren lake reports', AMEREN_OSAGE_REPORTS_URL, /bagnell-daily-report/i],
  ];
  for (const [name, url, mustContain] of shared) {
    if (!dams.some((dam) => damSourceLinks(dam).some((link) => link.url === url))) continue;
    try {
      const problem = await checkPage(url, mustContain);
      if (problem) fail(name, `${url} ${problem}`);
      else console.log(`ok    ${name} → ${url}`);
    } catch (error) {
      fail(name, `${url} could not be read (${(error as Error).message})`);
    }
  }

  console.log(failures === 0 ? `\nAll source links resolve (${dams.length} dams).` : `\n${failures} problem(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
