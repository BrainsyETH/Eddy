import assert from 'node:assert/strict';
import test from 'node:test';
import { USACE_DAMS, declaresCardMetric, type UsaceDam } from './flow-providers/usace-registry';
import {
  DAM_PAGE_COPY, SITE_URL, USACE_DISTRICT_OPERATORS,
  damAboutSentences, damHasPostedSchedule, damPageCopy, damStateName, damStructuredData,
} from './dam-page-copy';
import { jsonLdString } from './json-ld';
import { renderedTitle } from './seo';
import { generateMetadata } from '../app/dams/[damId]/page';

const dams = Object.values(USACE_DAMS);

// Capabilities come from declarations, never from an office or a district:
// an `office` says where to look, not that a reading exists there.
const capability = {
  schedule: damHasPostedSchedule,
  forecast: (dam: UsaceDam) => Boolean(dam.series.generationForecast),
  // The same declarations the dam cards use to word an absent reading.
  level: (dam: UsaceDam) => declaresCardMetric(dam, 'poolElevation'),
  waterTemperature: (dam: UsaceDam) => declaresCardMetric(dam, 'tailwaterTempF'),
};
const claims: Record<keyof typeof capability, RegExp> = {
  schedule: /schedule/i,
  forecast: /forecast/i,
  level: /\blevel\b/i,
  waterTemperature: /water temperature/i,
};

async function metadataTitle(dam: UsaceDam): Promise<string> {
  const metadata = await generateMetadata({ params: Promise.resolve({ damId: dam.id }) });
  assert.equal(typeof metadata.title, 'string', `${dam.id} metadata title`);
  return metadata.title as string;
}

test('every registry dam has hand-written page copy, and no copy outlives its dam', () => {
  assert.deepEqual(Object.keys(DAM_PAGE_COPY).toSorted(), Object.keys(USACE_DAMS).toSorted());
});

test('the page serves the written copy, and the branded title fits a search result', async () => {
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const dam of dams) {
    const { title, description } = damPageCopy(dam);
    assert.equal(await metadataTitle(dam), title, `${dam.id} page metadata ignores its copy`);
    const shown = renderedTitle(title);
    assert.ok(shown.endsWith(' | Eddy') && !/eddy/i.test(title), `${dam.id}: ${shown}`);
    // Google cuts titles near 600px (about 60–65 characters). The brand may be
    // cut, but the dam's name must survive it.
    assert.ok(shown.length <= 65, `${dam.id} rendered title is ${shown.length} chars: ${shown}`);
    const words = dam.name.replace(/\s+(Lock & Dam|Dam|Lake)$/, '').split(' ');
    const at = Math.max(shown.indexOf(words[0]), shown.indexOf(words.at(-1)!));
    assert.ok(at >= 0 && at < 40, `${dam.id}: "${shown}" does not name ${dam.name} early`);
    assert.ok(description.length >= 100 && description.length <= 160, `${dam.id} description is ${description.length} chars`);
    assert.ok(!titles.has(title) && !descriptions.has(description), `${dam.id} reuses copy`);
    titles.add(title);
    descriptions.add(description);
  }
});

test('copy claims only declared capabilities, and names the page’s main product', () => {
  for (const dam of dams) {
    const { title, description } = damPageCopy(dam);
    const copy = `${title} ${description}`;
    for (const [name, pattern] of Object.entries(claims) as [keyof typeof capability, RegExp][]) {
      if (pattern.test(copy)) assert.ok(capability[name](dam), `${dam.id} claims ${name} without a declared source: ${copy}`);
    }
    if (capability.schedule(dam)) assert.match(title, claims.schedule, `${dam.id} title hides its hourly schedule`);
    if (capability.forecast(dam)) assert.match(title, claims.forecast, `${dam.id} title hides its generation forecast`);
    assert.doesNotMatch(copy, /\btoday/i, `${dam.id} copy cannot vouch for freshness`);
  }
  // The claims are real constraints, not a populated registry: Stockton
  // publishes no pool reading, and nothing outside Nashville declares a forecast.
  assert.equal(capability.level(USACE_DAMS['nwk-stockton-dam']), false);
  assert.deepEqual(dams.filter(capability.forecast).map((dam) => dam.id).toSorted(), ['lrn-center-hill-dam', 'lrn-dale-hollow-dam', 'lrn-wolf-creek-dam']);
});

test('each dam names its real operator', () => {
  // Kansas City publishes nothing to CWMS, so its dams carry no office to check against.
  const kansasCity = new Set(['nwk-stockton-dam', 'nwk-truman-dam']);
  for (const dam of dams) {
    const expected = dam.amerenMetrics === 'osage' ? 'Ameren Missouri'
      : dam.office ? USACE_DISTRICT_OPERATORS[dam.office]
        : kansasCity.has(dam.id) ? 'the U.S. Army Corps of Engineers, Kansas City District'
          : undefined;
    assert.ok(expected, `${dam.id} has no known operator`);
    assert.equal(damPageCopy(dam).operator, expected, dam.id);
  }
});

test('About text states declared facts without classifying the structure from its name', () => {
  for (const dam of dams) {
    const sentences = damAboutSentences(dam);
    const text = sentences.join(' ');
    assert.equal(sentences.length, 3, dam.id);
    assert.ok(text.includes(damPageCopy(dam).operator!), `${dam.id} omits its operator`);
    assert.ok(text.includes(damPageCopy(dam).belowDam), `${dam.id} omits the water below`);
    assert.doesNotMatch(text, /is a reservoir/, dam.id);
    if (!damHasPostedSchedule(dam)) assert.doesNotMatch(text, /Southwestern Power/, dam.id);
  }
  assert.deepEqual(damAboutSentences(USACE_DAMS['swl-table-rock-dam']), [
    'Table Rock Dam, in Missouri, forms Table Rock Lake and is operated by the U.S. Army Corps of Engineers, Little Rock District.',
    'Its powerhouse has 4 generating units rated at 200 MW, and the Southwestern Power Administration posts its hourly generation schedule.',
    'Water released here flows into Lake Taneycomo, a cold-water trout fishery.',
  ]);
  assert.equal(damAboutSentences(USACE_DAMS['mvs-wappapello'])[0],
    'The dam at Wappapello Lake, in Missouri, is operated by the U.S. Army Corps of Engineers, St. Louis District.');
  assert.match(damAboutSentences(USACE_DAMS['nwk-stockton-dam'])[1], /1 generating unit rated/);
  assert.match(damAboutSentences(USACE_DAMS['swl-clearwater-dam'])[1], /no powerhouse/);
  assert.match(damAboutSentences(USACE_DAMS['ameren-bagnell-dam'])[0], /operated by Ameren Missouri\.$/);
});

// Checked against the schema.org vocabulary (schemaorg-current-https.jsonld)
// on 2026-11-09. schema.org has no Dam type, which is why the structure is a
// CivicStructure. Extend this only after checking the vocabulary again.
const VALIDATED_PROPERTIES: Record<string, string[]> = {
  BreadcrumbList: ['itemListElement'],
  ListItem: ['position', 'name', 'item'],
  CivicStructure: ['@id', 'name', 'url', 'geo', 'containedInPlace'],
  GeoCoordinates: ['latitude', 'longitude'],
  State: ['name'],
};

function assertValidatedNode(node: Record<string, unknown>, damId: string) {
  const type = node['@type'] as string;
  assert.ok(VALIDATED_PROPERTIES[type], `${damId} emits unvalidated type ${type}`);
  for (const [key, value] of Object.entries(node)) {
    if (key === '@type') continue;
    assert.ok(VALIDATED_PROPERTIES[type].includes(key), `${damId} emits ${type}.${key}`);
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child === 'object') assertValidatedNode(child as Record<string, unknown>, damId);
    }
  }
}

test('structured data for every dam uses validated vocabulary and accurate identity', () => {
  for (const dam of dams) {
    const data = damStructuredData(dam);
    assert.deepEqual(JSON.parse(jsonLdString(data)), data, `${dam.id} JSON-LD must round-trip`);
    assert.equal(data['@context'], 'https://schema.org');
    for (const node of data['@graph']) assertValidatedNode(node, dam.id);
    const [breadcrumbs, structure] = data['@graph'] as unknown as [
      { itemListElement: { position: number; name: string; item: string }[] },
      { name: string; url: string; geo: { latitude: number; longitude: number }; containedInPlace: { name: string } },
    ];
    const url = `${SITE_URL}/dams/${dam.id}`;
    assert.deepEqual(breadcrumbs.itemListElement.map((item) => item.position), [1, 2, 3]);
    assert.deepEqual(breadcrumbs.itemListElement.at(-1), { '@type': 'ListItem', position: 3, name: dam.name, item: url });
    assert.equal(structure.url, url);
    assert.equal(structure.name, dam.name);
    assert.deepEqual(structure.geo, { '@type': 'GeoCoordinates', latitude: dam.lat, longitude: dam.lon });
    // Inside the six-state footprint: catches swapped or sign-flipped coordinates.
    assert.ok(dam.lat > 33 && dam.lat < 40 && dam.lon > -97.5 && dam.lon < -84, `${dam.id} coordinates ${dam.lat},${dam.lon}`);
    assert.equal(structure.containedInPlace.name, damStateName(dam));
  }
});

test('a dam missing from the copy table still gets honest metadata', () => {
  const unlisted = { ...USACE_DAMS['nwk-stockton-dam'], id: 'test-unlisted-dam', name: 'Example Dam', lakeName: 'Example Lake' };
  assert.equal(damPageCopy(unlisted).title, 'Example Dam Generation Schedule');
  assert.equal(damAboutSentences(unlisted)[0], 'Example Dam, in Missouri, forms Example Lake.');
  const gated = { ...USACE_DAMS['swl-clearwater-dam'], id: 'test-gated-dam', name: 'Gate Dam' };
  assert.equal(damPageCopy(gated).title, 'Gate Dam Release');
  assert.doesNotMatch(`${damPageCopy(gated).title} ${damPageCopy(gated).description}`, claims.level);
});

// ── When SWPA posts ───────────────────────────────────────────────────────
//
// Every dam surface said "posted each afternoon" while dam_forecast_history
// showed weekday sheets first appearing overnight (see SCHEDULE_POSTING_NOTE).
// The copy is now one shared, measured note; this keeps the old claim from
// creeping back into a card, a tip, or a comment that a later change copies.

test('no dam surface says SWPA posts in the afternoon', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const roots = [
    'src/components/dam', 'src/app/dams', 'src/app/api/dams', 'src/app/api/dam-update',
    'src/app/api/cron/generate-dam-updates', 'src/app/api/cron/sync-dam-snapshots',
    'src/lib/usace', 'src/lib/eddy', 'shared', '../eddy-ios/src/components/dam',
  ];
  const files: string[] = [];
  const walk = (path: string) => {
    if (statSync(path).isDirectory()) for (const name of readdirSync(path)) walk(join(path, name));
    else if (/\.(ts|tsx)$/.test(path) && !/\.test\.ts$/.test(path)) files.push(path);
  };
  for (const root of roots) walk(root);
  for (const file of ['src/lib/data/dams.ts', 'src/lib/data/dam-snapshot-store.ts', 'src/lib/dam-schedule-availability.ts']) files.push(file);

  const claim = /(post|publish)\w*[^.\n]{0,60}\bafternoon\b|\bafternoon\b[^.\n]{0,30}(post|publish)|\b2\s*[-–]\s*4\s*PM\b/i;
  const offenders = files.filter((file) => {
    if (file.endsWith('dam-schedule-copy.ts')) return false; // The note's own history comment.
    return claim.test(readFileSync(file, 'utf8'));
  });
  assert.deepEqual(offenders, []);
});

test('the posting note says overnight, and both platforms use it', async () => {
  const { readFileSync } = await import('node:fs');
  const { SCHEDULE_POSTING_NOTE, SCHEDULE_POSTED_BY } = await import('@shared/dam-schedule-copy');
  for (const note of [SCHEDULE_POSTING_NOTE, SCHEDULE_POSTED_BY]) {
    assert.match(note, /overnight/);
    assert.doesNotMatch(note, /afternoon/i);
  }
  for (const file of [
    'src/components/dam/GenerationCard.tsx',
    // The dam report's "schedule currently unavailable" copy, shared with the cards.
    'src/lib/dam-schedule-availability.ts',
    '../eddy-ios/src/components/dam/GenerationCard.tsx',
  ]) assert.match(readFileSync(file, 'utf8'), /SCHEDULE_POSTING_NOTE/, file);
  assert.match(readFileSync('src/app/dams/[damId]/page.tsx', 'utf8'), /damScheduleAvailability\(/);
  assert.match(readFileSync('../eddy-ios/src/components/dam/GenerationSchedule.tsx', 'utf8'), /SCHEDULE_POSTED_BY/);
});
