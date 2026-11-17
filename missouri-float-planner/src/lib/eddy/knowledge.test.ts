import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getGeneralKnowledge, getKnowledgeForChat, getKnowledgeForTarget, getKnowledgeTowns, getRiverKnowledgeForGauge,
  gaugeTown, listKnowledgeGauges, listKnowledgeRiverSlugs, listKnowledgeSectionGauges, parseKnowledge,
} from './knowledge';

// These run against the REAL EDDY_KNOWLEDGE.md (parseKnowledgeFile reads
// cwd/EDDY_KNOWLEDGE.md, and the test runner's cwd is the web root). That is
// deliberate: the failure this file guards is a heading whose slug does not
// match rivers.slug, and a fixture cannot catch that.
//
// The trust check (src/lib/trust/checks/eddy-knowledge.ts) covers the same
// ground from the other side, but it needs the database. CI is hermetic, so
// without these the derivation bug below ships and only surfaces in prose.

/**
 * Rivers whose DB slug KEEPS the "River"/"Creek" suffix that slugify() strips.
 * Each of these resolved to the wrong slug before headings carried `{#anchor}`
 * — "## Big River" derived "big", found no river, and Eddy wrote Big River up
 * from the General Ozarks primer alone. Silent, and confident.
 */
const SUFFIX_KEEPING = [
  ['big-river', 'big'],
  ['bryant-creek', 'bryant'],
  ['kings-river', 'kings'],
  ['war-eagle-creek', 'war-eagle'],
  ['crooked-creek', 'crooked'],
  ['caddo-river', 'caddo'],
  ['spring-river', 'spring'],
] as const;

/** Just the river's own block, with the General primer that rides along stripped off. */
function riverBlock(slug: string): string {
  return getKnowledgeForTarget(slug, null).split(`=== ${slug} River Knowledge ===`)[1] ?? '';
}

test('rivers whose slug keeps its suffix resolve to the DB slug, not the stripped one', () => {
  const slugs = new Set(listKnowledgeRiverSlugs());
  for (const [dbSlug, strippedSlug] of SUFFIX_KEEPING) {
    assert.ok(slugs.has(dbSlug), `EDDY_KNOWLEDGE.md has no section for "${dbSlug}"`);
    assert.ok(
      !slugs.has(strippedSlug),
      `"${strippedSlug}" parsed out of a heading — the {#${dbSlug}} anchor is missing or malformed`,
    );
  }
});

test('the two same-named Spring Rivers stay separate sections', () => {
  // Same name, different states, different basins, different gauges. A heading
  // collision here would merge Arkansas's Mammoth Spring river into Missouri's
  // prairie-border one, which is the worst kind of wrong: plausible.
  const slugs = new Set(listKnowledgeRiverSlugs());
  assert.ok(slugs.has('spring-river'), 'no section for the Arkansas Spring River');
  assert.ok(slugs.has('spring-river-mo'), 'no section for the Missouri Spring River');

  const ar = riverBlock('spring-river');
  const mo = riverBlock('spring-river-mo');
  assert.match(ar, /Mammoth Spring/);
  assert.match(ar, /Hardy/);
  assert.match(mo, /Carthage/);
  // The Missouri section names Mammoth Spring once, to say it is NOT that
  // river. It must not carry the Arkansas river's gauges or hazards.
  assert.ok(!/Hardy|Saddler Falls/.test(mo), 'Arkansas content bled into the Missouri section');
  assert.ok(!/Carthage/.test(ar), 'Missouri content bled into the Arkansas section');
});

test('front matter above "## General" is not parsed as a river', () => {
  // "## Format Rules" is an H2 like any other. Parsed as one it became a river
  // named `format-rules` — a knowledge section matching no river, which is the
  // exact shape of the mis-anchored-heading bug the anchors exist to prevent.
  const slugs = listKnowledgeRiverSlugs();
  assert.ok(!slugs.includes('format-rules'), 'the Format Rules block parsed as a river section');
  assert.ok(!getGeneralKnowledge().includes('{#'), 'front matter leaked into General knowledge');
});

test('an anchored subsection is loaded for its section slug', () => {
  // Section slugs come from river_sections.section_slug and rarely match what
  // slugify() would derive from a readable heading ("Morse Mill to Cedar Hill"
  // happens to; "Sycamore / Hodgson Mill to Warren Bridge" does not).
  const slug = 'hodgson-mill-to-warren-bridge';
  const withSection = getKnowledgeForTarget('bryant-creek', slug);
  assert.match(withSection, new RegExp(`=== Section: ${slug} ===`));
  assert.match(withSection, /Narrows/);

  const withoutSection = getKnowledgeForTarget('bryant-creek', null);
  assert.ok(!/=== Section: /.test(withoutSection));
});

test('an unknown section falls back to river knowledge instead of throwing', () => {
  const knowledge = getKnowledgeForTarget('bryant-creek', 'no-such-reach');
  assert.ok(!/=== Section: /.test(knowledge));
  assert.match(knowledge, /=== bryant-creek River Knowledge ===/);
});

test('general knowledge rides along with every river', () => {
  const knowledge = getKnowledgeForTarget('mulberry', 'redding-to-turner-bend');
  assert.match(knowledge, /=== General Ozarks Knowledge ===/);
  assert.match(knowledge, /=== mulberry River Knowledge ===/);
  assert.match(knowledge, /=== Section: redding-to-turner-bend ===/);
});

test('the General block keeps the primer, and towns live with their river', () => {
  // Regression for the flushBuffer bug where a General subsection overwrote
  // the whole primer rather than appending to it.
  const general = getGeneralKnowledge();
  assert.match(general, /strainer/i);
  // The nearest-towns list used to ride in General, so every Read on every
  // river carried every river's towns. Each river holds its own now.
  assert.doesNotMatch(general, /nearest town/i);
  assert.match(getKnowledgeTowns('jacks-fork'), /\*\*Eminence\*\* is the hub/);
  assert.match(getKnowledgeTowns('current'), /Upper river: .*\*\*Salem\*\*/);
});

test('no heading anchor leaks into the injected text', () => {
  // The anchor is matching syntax, not prose. If one reaches the prompt, Eddy
  // will happily print "{#big-river}" in a paragraph about the river.
  for (const slug of listKnowledgeRiverSlugs()) {
    assert.ok(
      !getKnowledgeForTarget(slug, null).includes('{#'),
      `an anchor leaked into the knowledge text for "${slug}"`,
    );
  }
});

test('a downstream gauge gets the river overview, not the upper river as its own', () => {
  assert.equal(gaugeTown('Meramec River near Eureka, MO'), 'Eureka');
  assert.equal(gaugeTown('Crooked Creek at Kelly Crossing at Yellville, AR'), 'Yellville');
  assert.equal(gaugeTown('Mystery Station'), null);
  const eureka = getRiverKnowledgeForGauge('meramec', 'Meramec River near Eureka, MO');
  assert.match(eureka, /Lower Meramec is wider, calmer/);
  assert.match(eureka, /different river from the Meramec at Eureka/);
  // The upper-river subsection is not handed to a lower-river station.
  assert.doesNotMatch(eureka, /More rapids, narrower channel/);
  assert.doesNotMatch(eureka, /General Ozarks Knowledge/);
  assert.equal(getRiverKnowledgeForGauge('no-such-river', 'Somewhere near Nowhere, MO'), '');
});

// The three trout tailwaters are dam-controlled, and their notes feed prose a
// reader may wade by. Same rule as the tailwater guides
// (src/lib/guides/tailwater-guide.test.ts): describe what the dam does, never
// clear the water, and never state a superseded rule or an undated reading.
test('tailwater knowledge does not clear the water or state a stale rule', () => {
  for (const slug of ['white', 'norfork-tailwater', 'taneycomo']) {
    const block = riverBlock(slug);
    assert.ok(block.length > 200, `${slug} has no knowledge section`);
    assert.doesNotMatch(
      block,
      /wadeable|wading is finished|safe to wade|only warning|good to go|every unit is idle/i,
      slug,
    );
    // Norfork's blanket catch-and-release order ended 2026-02-01.
    assert.doesNotMatch(block, /catch-and-release from end to end/i, slug);
    // A temperature is background only when it carries the year it was read.
    for (const line of block.split('\n').filter((l) => /°F/.test(l))) {
      assert.match(line, /\b20\d\d\b/, `${slug}: undated temperature: ${line.slice(0, 80)}`);
    }
  }
});

// ── gauges ──────────────────────────────────────────────────────────
// A river's Read is written from one gauge, and a gauge speaks for one stretch
// of water. On 2026-11-17 three Reads credited a spring to a gauge that sits
// above it (Big Spring at Van Buren, Bennett Spring at Windyville, Alley
// Spring at the Alley Spring gauge). Each fact was true and in the river's
// block; none said where it was. Gauge blocks say where.

const ALLEY = '07065495';
const EMINENCE = '07066000';
const VAN_BUREN = '07067000';
const WINDYVILLE = '06923250';

/** Every text any consumer can be handed for a river. */
function everySelection(slug: string): string[] {
  const gauges = listKnowledgeGauges(slug);
  return [
    getKnowledgeForTarget(slug, null),
    getKnowledgeForChat(slug),
    getRiverKnowledgeForGauge(slug, null),
    ...gauges.flatMap((g) => [getKnowledgeForTarget(slug, null, g.siteId), getRiverKnowledgeForGauge(slug, `X River near ${g.name}, MO`, g.siteId)]),
  ];
}

test('the format is read from the headings', () => {
  const parsed = parseKnowledge([
    '## Format Rules', 'not knowledge',
    '## General', 'Primer.',
    '## Test River {#test}', 'True everywhere.',
    '### Gauge: Lower Town {@01234567}', '- **Sits**: At Lower Town.',
    '### Gauge: Dam {@swl-test-dam} {unconfirmed}', '- **Sits**: Draft.',
    '### Upper Reach {#upper-reach} {@01234567} {@07654321}', '- A reach note.',
    '### Towns', '- **Lower Town** has gas.',
  ].join('\n'));
  const river = parsed.rivers.test;
  assert.equal(river.main, 'True everywhere.');
  assert.deepEqual(river.gauges, [
    { siteId: '01234567', name: 'Lower Town', text: '- **Sits**: At Lower Town.', confirmed: true },
    { siteId: 'swl-test-dam', name: 'Dam', text: '- **Sits**: Draft.', confirmed: false },
  ]);
  assert.deepEqual(river.subsections, { 'upper-reach': '- A reach note.' });
  assert.deepEqual(river.sectionGauges, { 'upper-reach': ['01234567', '07654321'] });
  assert.equal(river.towns, '- **Lower Town** has gas.');
  assert.deepEqual(Object.keys(parsed.rivers), ['test']);
});

test('every gauge block is tagged, and a confirmed one says where it sits and what it speaks for', () => {
  for (const slug of listKnowledgeRiverSlugs()) {
    const gauges = listKnowledgeGauges(slug);
    assert.equal(new Set(gauges.map((g) => g.siteId)).size, gauges.length, `${slug}: two blocks for one gauge`);
    for (const gauge of gauges) {
      assert.match(gauge.siteId, /^(?:\d{8,}|[a-z]+(?:-[a-z0-9]+)+)$/, `${slug}: "Gauge: ${gauge.name}" needs a {@site} tag`);
      assert.match(gauge.text, /^- \*\*Sits\*\*: \S/m, `${slug}/${gauge.name}: no "Sits" line`);
      assert.match(gauge.text, /^- \*\*Speaks for\*\*: \S/m, `${slug}/${gauge.name}: no "Speaks for" line`);
      if (gauge.confirmed) {
        assert.doesNotMatch(gauge.text, /to confirm|\bdraft\b/i, `${slug}/${gauge.name}: confirmed, but still reads as a draft`);
      }
    }
    // A reach note may only be tagged with a gauge the river has a block for.
    const known = new Set(gauges.map((g) => g.siteId));
    for (const [section, sites] of Object.entries(listKnowledgeSectionGauges(slug))) {
      for (const site of sites) assert.ok(known.has(site), `${slug}/${section}: tagged with ${site}, which has no gauge block`);
    }
  }
});

test('the rivers whose gauge lines are confirmed are exactly these', () => {
  // A ratchet. Confirming a river's geography means removing {unconfirmed}
  // from its headings AND adding it here, so the change is deliberate. A
  // drafted block reaches no prompt; a confirmed one changes what Eddy writes.
  const confirmed = listKnowledgeRiverSlugs()
    .filter((slug) => listKnowledgeGauges(slug).some((g) => g.confirmed))
    .sort();
  assert.deepEqual(confirmed, ['current', 'jacks-fork', 'niangua']);
  assert.deepEqual(
    Object.fromEntries(confirmed.map((slug) => [slug, listKnowledgeGauges(slug).filter((g) => g.confirmed).map((g) => g.siteId)])),
    { current: [VAN_BUREN], 'jacks-fork': [EMINENCE, ALLEY], niangua: [WINDYVILLE, '06923950'] },
  );
});

test('no tag and no drafted line reaches any prompt', () => {
  for (const slug of listKnowledgeRiverSlugs()) {
    const drafts = listKnowledgeGauges(slug).filter((g) => !g.confirmed);
    for (const text of everySelection(slug)) {
      assert.doesNotMatch(text, /\{[#@]|\{unconfirmed\}/, `${slug}: a heading tag leaked`);
      assert.doesNotMatch(text, /To confirm/, `${slug}: a drafted line leaked`);
      for (const draft of drafts) assert.ok(!text.includes(draft.text), `${slug}: drafted block for ${draft.name} leaked`);
    }
  }
});

test("a river's Read gets its own gauge in full and every other gauge in one line", () => {
  const read = getKnowledgeForTarget('jacks-fork', null, EMINENCE);
  assert.match(read, /=== This gauge: Eminence \(07066000\) ===/);
  assert.match(read, /Alley Spring to Two Rivers, the stretch the spring carries/);
  assert.match(read, /outfitters' rule of thumb at Eminence/);

  const elsewhere = read.split("=== Elsewhere on this river: patterns only, never today's conditions ===")[1];
  assert.ok(elsewhere, 'no elsewhere block');
  // Where the other gauge sits and what it speaks for, and nothing else of it.
  assert.match(elsewhere, /- Alley Spring gauge: At Alley Spring, just ABOVE where the spring's water enters/);
  assert.match(elsewhere, /Speaks for: The upper Jacks Fork, above Alley Spring\./);
  assert.doesNotMatch(read, /narrow, twisty, and technical/);
  // Mountain View is drafted, so it is not listed at all.
  assert.doesNotMatch(read, /Mountain View gauge/);
});

test("a gauge's Read gets its own block and nothing of the others", () => {
  const alley = getRiverKnowledgeForGauge('jacks-fork', 'Jacks Fork at Alley Spring, MO', ALLEY);
  assert.match(alley, /This gauge: Alley Spring \(07065495\)/);
  assert.match(alley, /does NOT include the spring's water/);
  assert.match(alley, /narrow, twisty, and technical/);
  assert.doesNotMatch(alley, /rule of thumb at Eminence|Eddy's primary gauge/);
  assert.doesNotMatch(alley, /General Ozarks Knowledge|Elsewhere on this river/);
});

test('each spring is placed on the right side of its gauge', () => {
  // The three errors of 2026-11-17, as the file now states them.
  const vanBuren = getKnowledgeForTarget('current', null, VAN_BUREN);
  assert.match(vanBuren, /Below it: Big Spring, which enters a few miles downstream, so this gauge does NOT include Big Spring's water/);
  // The line that put it upstream is gone from everything Van Buren is told.
  assert.doesNotMatch(vanBuren, /Big Spring near Van Buren adds massive flow/);
  assert.equal(riverBlock('current').match(/Big Spring/g), null, 'the river-wide block must not place Big Spring');

  const windyville = getKnowledgeForTarget('niangua', null, WINDYVILLE);
  assert.match(windyville, /about 14 river miles ABOVE Bennett Spring/);
  assert.match(windyville, /this gauge does NOT include the spring's water/);
  assert.doesNotMatch(riverBlock('niangua'), /Reliable base flow thanks to Bennett Spring/);

  assert.match(getKnowledgeForTarget('jacks-fork', null, ALLEY), /=== This gauge: Alley Spring \(07065495\) ===[\s\S]*just ABOVE where the spring's water enters/);
});

test('a river with no confirmed block for the gauge is selected as it always was', () => {
  // Meramec's blocks are drafts, so naming its gauge changes nothing.
  assert.equal(getKnowledgeForTarget('meramec', null, '07013000'), getKnowledgeForTarget('meramec', null));
  assert.equal(
    getRiverKnowledgeForGauge('meramec', 'Meramec River near Eureka, MO', '07019000'),
    getRiverKnowledgeForGauge('meramec', 'Meramec River near Eureka, MO'),
  );
  // And a confirmed river asked about a gauge it has only a draft for.
  const akers = getRiverKnowledgeForGauge('current', 'Current River above Akers, MO', '07064533');
  assert.doesNotMatch(akers, /This gauge:/);
  assert.match(akers, /Section upper-current:/);
});

test('chat is told everything about the river in view, towns included, and no Read is told the towns', () => {
  const chat = getKnowledgeForChat('current');
  assert.match(chat, /=== General Ozarks Knowledge ===/);
  assert.match(chat, /=== Gauge: Van Buren \(07067000\) ===/);
  assert.match(chat, /=== Section: upper-current ===/);
  assert.match(chat, /=== Section: lower-current ===/);
  assert.match(chat, /=== Towns and services ===[\s\S]*\*\*Van Buren\*\*/);
  // No river in view: the primer alone.
  assert.equal(getKnowledgeForChat(null), `=== General Ozarks Knowledge ===\n${getGeneralKnowledge()}`);

  for (const text of [getKnowledgeForTarget('current', null, VAN_BUREN), getRiverKnowledgeForGauge('current', 'Current River at Doniphan, MO', '07068000')]) {
    assert.doesNotMatch(text, /Towns and services|nearest town is/);
  }
});

test('no knowledge sends a reader to another river', () => {
  // The Read prompt forbids suggesting a river it has no gauge data for.
  assert.doesNotMatch(getGeneralKnowledge(), /choose Eleven Point|over Current or Meramec/);
  assert.doesNotMatch(getKnowledgeForChat('niangua'), /good fallback|good alternative/);
  assert.doesNotMatch(getKnowledgeForChat('courtois'), /If Huzzah is too crowded/);
});
