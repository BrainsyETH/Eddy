import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildSnapshot, refreshStaleness, summaryOf } from '@/lib/data/dams';
import {
  AMEREN_DAILY_REPORT_URL,
  AMEREN_OSAGE_REPORTS_URL,
  SOURCE_LINK_HOSTS,
  SWPA_SCHEDULES_URL,
  damSourceLinks,
  usaceWaterPageUrl,
} from '@/lib/data/dam-source-links';
import { USACE_DAMS, getUsaceDam } from '@/lib/flow-providers/usace-registry';
import type { DamSnapshot } from '@shared/dam-types';
// The iOS half: which links a shipped binary agrees to draw. eddy-ios has no
// runner of its own, so its pure logic is checked from here.
import {
  damSourceLink as iosSourceLink,
  damSourceLinks as iosSourceLinks,
  generationCardRenders,
  standaloneSourceLinks,
} from '../../../../eddy-ios/src/lib/damSourceLinks';

// What a dam card may link out to.
//
// These URLs are opened by a web page and by a shipped iOS app on the server's
// say-so, so the contract is pinned here: which hosts, which scheme, one link
// per kind, and every dam covered. Whether each page still EXISTS is a
// question about somebody else's site and needs the network; that is
// scripts/check-dam-source-links.ts, kept out of this hermetic suite.

const dams = Object.values(USACE_DAMS);

test('every dam has exactly one link for its readings', () => {
  // A dam added to the registry without a page would silently ship a card
  // with no way to the source. The registry field's comment says how to find
  // the slug.
  for (const dam of dams) {
    const readings = damSourceLinks(dam).filter((link) => link.kind === 'readings');
    assert.equal(readings.length, 1, `${dam.id} needs exactly one readings link (usaceWaterPage)`);
  }
});

test('the link beside the readings names the publisher of those readings', () => {
  // A link under a number reads as its source, whatever the label says. So the
  // readings link has to follow the same branch `sources` does. Truman is the
  // case that broke it: a Corps dam whose numbers come from Ameren's report.
  const attribution: Record<string, string> = {
    'water.usace.army.mil': 'USACE CWMS',
    'www.ameren.com': 'Ameren Missouri',
  };
  const reading = { value: 1, unit: 'cfs', at: '2026-11-16T12:00:00Z', staleness: 'fresh' } as const;
  for (const dam of dams) {
    const snapshot = buildSnapshot(dam, { release: reading }, []);
    const readings = snapshot.sourceLinks!.find((link) => link.kind === 'readings')!;
    assert.deepEqual(
      snapshot.sources,
      [attribution[new URL(readings.url).hostname]],
      `${dam.id}: the readings link (${readings.url}) and the attribution (${snapshot.sources}) name different publishers`
    );
  }
});

test('a schedule link exists exactly where SWPA schedules the project', () => {
  for (const dam of dams) {
    const schedule = damSourceLinks(dam).filter((link) => link.kind === 'schedule');
    assert.equal(schedule.length, dam.swpaCode ? 1 : 0, dam.id);
    if (dam.swpaCode) assert.equal(schedule[0].url, SWPA_SCHEDULES_URL);
  }
});

test('every link is an https page on a pinned publisher host, with text to show', () => {
  for (const dam of dams) {
    for (const link of damSourceLinks(dam)) {
      const url = new URL(link.url);
      assert.equal(url.protocol, 'https:', `${dam.id}: ${link.url}`);
      assert.ok((SOURCE_LINK_HOSTS as readonly string[]).includes(url.hostname), `${dam.id}: unexpected host ${url.hostname}`);
      assert.equal(url.username + url.password + url.port + url.search + url.hash, '', `${dam.id}: ${link.url}`);
      assert.ok(link.label.trim() && link.publisher.trim(), `${dam.id}: a link needs its label and publisher`);
    }
  }
});

test('a Corps page is addressed by district and location, as the site spells it', () => {
  assert.equal(
    usaceWaterPageUrl('swl/bull_shoals_dam'),
    'https://water.usace.army.mil/overview/swl/locations/bull_shoals_dam'
  );
  // St. Louis slugs carry a space, percent-encoded once. Encoding it again
  // (mark%2520twain…) draws the site's "Location Not Found" under a 200.
  const markTwain = damSourceLinks(getUsaceDam('mvs-mark-twain')!)[0].url;
  assert.equal(markTwain, 'https://water.usace.army.mil/overview/mvs/locations/mark%20twain%20lk');
  assert.equal(new URL(markTwain).href, markTwain, 'the URL survives parsing unchanged');

  for (const dam of dams) {
    if (!dam.usaceWaterPage) continue;
    assert.match(dam.usaceWaterPage, /^[a-z]{3}\/[a-z0-9_%]+$/, `${dam.id}: ${dam.usaceWaterPage}`);
    // The district in the page is the district in the id: a page copied from
    // a neighbouring entry is the likeliest way to get this wrong.
    assert.equal(dam.usaceWaterPage.split('/')[0], dam.id.split('-')[0], dam.id);
  }
  const pages = dams.map((dam) => dam.usaceWaterPage).filter(Boolean);
  assert.equal(new Set(pages).size, pages.length, 'no two dams share a Corps page');
});

test('Bagnell and Truman link their readings to Ameren; only Truman also has an operator page', () => {
  assert.deepEqual(damSourceLinks(getUsaceDam('ameren-bagnell-dam')!), [
    { kind: 'readings', label: 'Ameren lake reports', publisher: 'Ameren Missouri', url: AMEREN_OSAGE_REPORTS_URL },
  ]);

  // Truman's readings reach Eddy through Ameren's daily report, so that is
  // what sits beside them. The Corps runs the dam, and its page is still
  // offered — as a reference, which no surface places under a reading.
  assert.deepEqual(damSourceLinks(getUsaceDam('nwk-truman-dam')!), [
    { kind: 'readings', label: 'Ameren daily report', publisher: 'Ameren Missouri', url: AMEREN_DAILY_REPORT_URL },
    { kind: 'schedule', label: 'SWPA schedule', publisher: 'Southwestern Power Administration', url: SWPA_SCHEDULES_URL },
    {
      kind: 'reference',
      label: 'Corps of Engineers data',
      publisher: 'U.S. Army Corps of Engineers',
      url: 'https://water.usace.army.mil/overview/nwk/locations/hast',
    },
  ]);
});

test('a reference link exists only where the readings came from somebody else', () => {
  for (const dam of dams) {
    const links = damSourceLinks(dam);
    const reference = links.filter((link) => link.kind === 'reference');
    assert.equal(reference.length, dam.amerenMetrics && dam.usaceWaterPage ? 1 : 0, dam.id);
    // Never the same page twice on one screen.
    assert.equal(new Set(links.map((link) => link.url)).size, links.length, dam.id);
    assert.equal(new Set(links.map((link) => link.kind)).size, links.length, `${dam.id}: one link per kind`);
  }
});

test('the links are sent even when a read returned nothing', () => {
  // `sources` follows what this read returned; the links do not. A failed
  // feed is when the publisher's page is most worth having.
  const dam = getUsaceDam('swl-bull-shoals-dam')!;
  const empty = buildSnapshot(dam, {}, []);
  assert.deepEqual(empty.sources, []);
  assert.deepEqual(empty.sourceLinks, damSourceLinks(dam));
  // The list payload carries them too, so a screen seeded from the summary
  // does not gain a row when the detail arrives.
  assert.deepEqual(summaryOf(empty)?.sourceLinks, damSourceLinks(dam));
});

test('a stored snapshot is served with the registry’s links, not its own', () => {
  const dam = getUsaceDam('swl-table-rock-dam')!;
  const built = buildSnapshot(dam, {}, []);

  // Stored before the field existed.
  const { sourceLinks: _absent, ...legacy } = built;
  assert.deepEqual(refreshStaleness(legacy as DamSnapshot).sourceLinks, damSourceLinks(dam));

  // Stored with a link the registry has since corrected.
  const outdated: DamSnapshot = {
    ...built,
    sourceLinks: [{ kind: 'readings', label: 'Old', publisher: 'Old', url: 'https://example.com/moved' }],
  };
  assert.deepEqual(refreshStaleness(outdated).sourceLinks, damSourceLinks(dam));
});

test('the app draws only https pages, one per half of the card', () => {
  const corps = { kind: 'readings', label: 'Corps of Engineers data', publisher: 'U.S. Army Corps of Engineers', url: 'https://water.usace.army.mil/overview/swl/locations/bull_shoals_dam' } as const;
  const swpa = { kind: 'schedule', label: 'SWPA schedule', publisher: 'Southwestern Power Administration', url: SWPA_SCHEDULES_URL } as const;

  // A build in the field meets payloads from before the field existed.
  assert.equal(iosSourceLink({}, 'readings'), null);
  assert.deepEqual(iosSourceLinks({}), []);

  // Card order is fixed, whatever order the wire used.
  assert.deepEqual(iosSourceLinks({ sourceLinks: [swpa, corps] }), [corps, swpa]);
  assert.equal(iosSourceLink({ sourceLinks: [corps] }, 'schedule'), null);

  // openExternalLink would hand tel: to the system and http: to the browser;
  // a control labelled as a data source opens an https page or is not drawn.
  for (const url of ['tel:8704315311', 'http://www.energy.gov/swpa/generation-schedules', 'javascript:alert(1)', 'not a url', '']) {
    assert.equal(iosSourceLink({ sourceLinks: [{ ...swpa, url }] }, 'schedule'), null, url);
  }

  // What the server sends today is all drawable, each link in one place.
  for (const dam of dams) {
    const sent = damSourceLinks(dam);
    const beside = iosSourceLinks({ sourceLinks: sent });
    const reference = iosSourceLink({ sourceLinks: sent }, 'reference');
    assert.deepEqual([...beside, ...(reference ? [reference] : [])], sent, dam.id);
  }
});

test('the operator reference never sits beside the readings in the app', () => {
  const truman = damSourceLinks(getUsaceDam('nwk-truman-dam')!);
  assert.deepEqual(iosSourceLinks({ sourceLinks: truman }).map((link) => link.kind), ['readings', 'schedule']);
  assert.equal(iosSourceLink({ sourceLinks: truman }, 'reference')?.url, 'https://water.usace.army.mil/overview/nwk/locations/hast');
});

test('the app keeps the links when a dam arrives with nothing at all', () => {
  // The case the first version lost. A hydropower dam whose every read failed
  // draws no Generation card (the screen shows its "nothing published" notice
  // instead), and the fallback asked only "does it have turbines" — so neither
  // drew, on the one screen with nothing else to offer.
  const sourceLinks = damSourceLinks(getUsaceDam('swl-bull-shoals-dam')!);
  const empty = { hasTurbines: true, metrics: {}, schedule: [], generating: null, sourceLinks };
  assert.equal(generationCardRenders(empty), false);
  assert.deepEqual(standaloneSourceLinks(empty).map((link) => link.kind), ['readings', 'schedule']);

  // With anything to show, the card is on screen and holds them itself.
  const day = { scheduleDate: '2026-11-16', retrievedAt: null, hours: [], idle: [] };
  for (const some of [{ schedule: [day] }, { generating: false }, { metrics: { release: { value: 1, unit: 'cfs', at: '2026-11-16T12:00:00Z', staleness: 'fresh' as const } } }]) {
    const dam = { ...empty, ...some };
    assert.equal(generationCardRenders(dam), true);
    assert.deepEqual(standaloneSourceLinks(dam), []);
  }

  // A flood-control dam never draws that card, with or without readings.
  const floodControl = { ...empty, hasTurbines: false, sourceLinks: damSourceLinks(getUsaceDam('swl-clearwater-dam')!) };
  for (const metrics of [{}, { release: { value: 336, unit: 'cfs', at: '2026-11-16T12:00:00Z', staleness: 'fresh' as const } }]) {
    assert.deepEqual(standaloneSourceLinks({ ...floodControl, metrics }).map((link) => link.kind), ['readings']);
  }
});

test('the dam screen decides its fallback from whether the card renders', () => {
  // The screen is not runnable here, so its wiring is pinned: both the card
  // and the fallback must come from the same tested helpers.
  const screen = readFileSync('../eddy-ios/app/(tabs)/(today,map,floats,favorites,alerts)/dam/[damId].tsx', 'utf8');
  assert.match(screen, /const showsGenerationCard = generationCardRenders\(dam\);/);
  assert.match(screen, /<DamSourceLinks links=\{standaloneSourceLinks\(dam\)\}/);
  assert.match(screen, /const hasAnything = damHasAnything\(dam\);/);
});

test('the web page offers the operator reference with its onward links, not in the card', () => {
  const page = readFileSync('src/app/dams/[damId]/page.tsx', 'utf8');
  const resources = page.slice(page.indexOf('id="dam-resources"'), page.indexOf('</div>', page.indexOf('id="dam-resources"')));
  assert.match(resources, /operatorPage && <Button href=\{operatorPage\.url\} external /);
  assert.match(page, /sourceLinks\?\.find\(\(link\) => link\.kind === 'reference'\)/);
  // The card asks for its two kinds by name and never iterates the list.
  const card = readFileSync('src/components/dam/GenerationCard.tsx', 'utf8');
  assert.doesNotMatch(card, /'reference'/);
  assert.doesNotMatch(card, /sourceLinks\?\.map/);
});
