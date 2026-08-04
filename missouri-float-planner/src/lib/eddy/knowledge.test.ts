import assert from 'node:assert/strict';
import test from 'node:test';
import { getGeneralKnowledge, getKnowledgeForTarget, listKnowledgeRiverSlugs } from './knowledge';

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

test('the General block keeps both the primer and the nearest-towns list', () => {
  // Regression for the flushBuffer bug where "### Nearest Towns" overwrote the
  // whole General primer rather than appending to it.
  const general = getGeneralKnowledge();
  assert.match(general, /strainer/i);
  assert.match(general, /nearest town/i);
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
