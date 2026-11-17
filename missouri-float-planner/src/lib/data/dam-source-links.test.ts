import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSnapshot, refreshStaleness, summaryOf } from '@/lib/data/dams';
import {
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
} from '../../../../eddy-ios/src/lib/damSourceLinks';

// What a dam card may link out to.
//
// These URLs are opened by a web page and by a shipped iOS app on the server's
// say-so, so the contract is pinned here: which hosts, which scheme, one link
// per kind, and every dam covered. Whether each page still EXISTS is a
// question about somebody else's site and needs the network; that is
// scripts/check-dam-source-links.ts, kept out of this hermetic suite.

const dams = Object.values(USACE_DAMS);

test('every dam links to its operator’s own data page', () => {
  // A dam added to the registry without a page would silently ship a card
  // with no way to the source. The registry field's comment says how to find
  // the slug.
  for (const dam of dams) {
    const readings = damSourceLinks(dam).filter((link) => link.kind === 'readings');
    assert.equal(readings.length, 1, `${dam.id} needs exactly one readings link (usaceWaterPage)`);
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

test('Bagnell links to its operator, and Truman to the Corps that runs it', () => {
  assert.deepEqual(damSourceLinks(getUsaceDam('ameren-bagnell-dam')!), [
    { kind: 'readings', label: 'Ameren lake reports', publisher: 'Ameren Missouri', url: AMEREN_OSAGE_REPORTS_URL },
  ]);
  // Truman's readings reach Eddy through Ameren's report, but the dam is the
  // Corps' and so is the page.
  const truman = damSourceLinks(getUsaceDam('nwk-truman-dam')!);
  assert.deepEqual(truman.map((link) => [link.kind, new URL(link.url).hostname]), [
    ['readings', 'water.usace.army.mil'],
    ['schedule', 'www.energy.gov'],
  ]);
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

  // What the server sends today is all drawable.
  for (const dam of dams) {
    const sent = damSourceLinks(dam);
    assert.deepEqual(iosSourceLinks({ sourceLinks: sent }), sent, dam.id);
  }
});
