import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EMBED_DARK_TOKENS,
  EMBED_LIGHT_TOKENS,
  embedThemeCss,
  formatObservedAge,
  impressionType,
  IMPRESSION_WIDGET_TYPES,
  LEGACY_IMPRESSION_TYPES,
  parseAccentColor,
  parseEmbedOptions,
  ratedReading,
  shortAge,
} from './options';

// ── Options off the query string ────────────────────────────────────────────

test('parseEmbedOptions reads the family parameters and refuses junk', () => {
  const o = parseEmbedOptions(new URLSearchParams('size=strip&theme=auto&bg=transparent&accent=2d7889&days=30&partner=Pine%20Valley&e=emb_0123abcd'));
  assert.equal(o.size, 'strip');
  assert.equal(o.theme, 'auto');
  assert.equal(o.transparent, true);
  assert.equal(o.accent, '#2D7889');
  assert.equal(o.days, 30);
  assert.equal(o.partner, 'Pine Valley');
  assert.equal(o.embedId, 'emb_0123abcd');

  const junk = parseEmbedOptions({ size: 'huge', theme: 'sepia', bg: 'red', accent: 'javascript:alert(1)', days: '9', e: 'emb_zzz' }, { size: 'full' });
  assert.equal(junk.size, 'full', 'unknown size falls back to the route default');
  assert.equal(junk.theme, 'light');
  assert.equal(junk.transparent, false);
  assert.equal(junk.accent, null);
  assert.equal(junk.days, 14);
  assert.equal(junk.embedId, null);
});

test('accent colors are normalised hex or nothing', () => {
  assert.equal(parseAccentColor('#f07052'), '#F07052');
  assert.equal(parseAccentColor('F07052'), '#F07052');
  assert.equal(parseAccentColor('#fff'), null);
  assert.equal(parseAccentColor('red'), null);
  assert.equal(parseAccentColor(''), null);
});

// ── Theme stylesheet ────────────────────────────────────────────────────────

test('theme css: light and dark are one block, auto adds a prefers-color-scheme override', () => {
  const light = embedThemeCss('f', { theme: 'light', transparent: false, accent: null });
  assert.ok(light.includes(`--ew-bg:${EMBED_LIGHT_TOKENS.bg}`));
  assert.ok(!light.includes('@media'));

  const dark = embedThemeCss('f', { theme: 'dark', transparent: false, accent: null });
  assert.ok(dark.includes(`--ew-bg:${EMBED_DARK_TOKENS.bg}`), 'dark is deep river teal, not generic #1a1a1a');
  assert.ok(dark.includes('color-scheme:dark'));
  assert.ok(!dark.includes('@media'));

  const auto = embedThemeCss('f', { theme: 'auto', transparent: false, accent: null });
  assert.ok(auto.includes('@media (prefers-color-scheme:dark)'));
  assert.ok(auto.includes(`--ew-bg:${EMBED_LIGHT_TOKENS.bg}`));
  assert.ok(auto.includes(`--ew-bg:${EMBED_DARK_TOKENS.bg}`));
});

test('theme css: transparent drops the panel, accent recolors links only', () => {
  const css = embedThemeCss('f', { theme: 'light', transparent: true, accent: '#123456' });
  assert.ok(css.includes('--ew-bg:transparent'));
  assert.ok(css.includes('--ew-link:#123456'));
  assert.ok(css.includes('--ew-accent:#123456'));
  // Surfaces and text keep the brand tokens — only the interactive color moves.
  assert.ok(css.includes(`--ew-surface:${EMBED_LIGHT_TOKENS.surface}`));
  assert.ok(css.includes(`--ew-text:${EMBED_LIGHT_TOKENS.text}`));
});

// ── Impressions ─────────────────────────────────────────────────────────────

test('impression allowlist carries every legacy name and every (kind, size) of the family', () => {
  for (const legacy of LEGACY_IMPRESSION_TYPES) assert.ok(IMPRESSION_WIDGET_TYPES.has(legacy), legacy);
  for (const kind of ['river', 'dam'] as const) {
    for (const size of ['badge', 'strip', 'card', 'full'] as const) {
      assert.ok(IMPRESSION_WIDGET_TYPES.has(impressionType(kind, size)), `${kind}-${size}`);
    }
    assert.ok(IMPRESSION_WIDGET_TYPES.has(impressionType(kind, 'badge', true)));
    assert.ok(IMPRESSION_WIDGET_TYPES.has(impressionType(kind, 'strip', true)));
    assert.ok(!IMPRESSION_WIDGET_TYPES.has(impressionType(kind, 'full', true)), 'no full-size image render exists');
  }
  // The API route must not keep its own copy of this list.
  const route = readFileSync(join(process.cwd(), 'src/app/api/embed/impression/route.ts'), 'utf8');
  assert.match(route, /IMPRESSION_WIDGET_TYPES/);
});

// ── The reading that leads ──────────────────────────────────────────────────

test('ratedReading leads with the unit the ladder is graded in', () => {
  // The Buffalo near St. Joe: rated in cfs, so 51.9 cfs leads and 2.8 ft is context.
  const cfs = ratedReading({ thresholdUnit: 'cfs', gaugeHeightFt: 2.8, dischargeCfs: 51.9 });
  assert.equal(cfs.unit, 'cfs');
  assert.equal(cfs.value, 51.9);
  assert.deepEqual(cfs.secondary, { unit: 'ft', value: 2.8 });

  const ft = ratedReading({ thresholdUnit: 'ft', gaugeHeightFt: 2.8, dischargeCfs: 51.9 });
  assert.equal(ft.unit, 'ft');
  assert.equal(ft.value, 2.8);
  assert.deepEqual(ft.secondary, { unit: 'cfs', value: 51.9 });

  // No ladder: prefer discharge when it exists, and never invent a secondary.
  const unrated = ratedReading({ thresholdUnit: null, gaugeHeightFt: null, dischargeCfs: 120 });
  assert.equal(unrated.unit, 'cfs');
  assert.equal(unrated.secondary, null);
});

test('observation ages read as one honest timestamp', () => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  assert.equal(formatObservedAge('2026-10-30T11:59:30Z', now), 'Observed just now');
  assert.equal(formatObservedAge('2026-10-30T11:48:00Z', now), 'Observed 12 min ago');
  assert.equal(formatObservedAge('2026-10-30T10:55:00Z', now), 'Observed 1 hr ago');
  assert.equal(formatObservedAge('2026-10-30T09:00:00Z', now), 'Observed 3 hrs ago');
  assert.equal(formatObservedAge('2026-10-28T09:00:00Z', now), 'Observed 2d ago');
  assert.equal(formatObservedAge(null, now), 'Observation time unavailable');
  assert.equal(shortAge('2026-10-30T10:55:00Z', now), '1h');
  assert.equal(shortAge('garbage', now), null);
});

// ── The regressions the overhaul exists to close ────────────────────────────

test('the card prints Eddy’s take whole — no sentence splitter, no accordion', () => {
  const card = readFileSync(join(process.cwd(), 'src/components/embed/v2/RiverEmbed.tsx'), 'utf8');
  assert.doesNotMatch(card, /splitQuote/, 'the splitter that cut "St. Joe" in half is gone');
  assert.doesNotMatch(card, /<details/, 'the take is not folded behind a disclosure');
  assert.match(card, /headlineReading/, 'the rated unit leads');
  assert.match(card, /RangeMeter/, 'the reading is placed on the ladder');
});

test('legacy embed routes stay alive as fixed sizes of the family', () => {
  const expect: Record<string, string> = {
    'src/app/embed/widget/[slug]/page.tsx': 'full',
    'src/app/embed/eddy-quote/[slug]/page.tsx': 'card',
    'src/app/embed/gauge-report/[slug]/page.tsx': 'full',
    'src/app/embed/badge/[slug]/page.tsx': 'badge',
  };
  for (const [file, size] of Object.entries(expect)) {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    assert.match(source, new RegExp(`defaultSize="${size}"`), `${file} renders the ${size} size`);
    assert.match(source, /lockSize/, `${file} ignores ?size= so a pasted iframe never changes shape`);
  }
});
