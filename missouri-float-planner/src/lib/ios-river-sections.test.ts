import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveRiverSection, sectionShowsDam, sectionOutlook } from '../../../eddy-ios/src/lib/riverSections';
import { outlookIsDamControlled } from './river-section-context';

const reaches = [
  { sectionSlug: 'upper-lesterville', name: 'Upper Black', riverType: 'spring_fed_float' as const, differsFromRiver: false, gaugeStationId: 'upper' },
  { sectionSlug: 'lower-markham-hammer', name: 'Lower Black', riverType: 'dam_tailwater' as const, differsFromRiver: true, gaugeStationId: 'lower' },
];
const gauges = [{ id: 'upper', usgsSiteId: '07061500' }, { id: 'lower', usgsSiteId: '07063000' }];
const base = { reaches, gauges, source: 'live' as const, gaugesReady: true };

test('native section selection drives the exact station and switches back', () => {
  assert.equal(resolveRiverSection(base).gauge?.id, 'upper');
  assert.equal(resolveRiverSection({ ...base, sectionSlug: reaches[1].sectionSlug }).gauge?.id, 'lower');
  assert.equal(resolveRiverSection({ ...base, sectionSlug: reaches[0].sectionSlug }).gauge?.id, 'upper');
});

test('a dam section link wins over a conflicting gauge; gauge-only links still work', () => {
  const fromDam = resolveRiverSection({ ...base, sectionSlug: reaches[1].sectionSlug, gaugeSiteId: '07061500' });
  assert.equal(fromDam.gauge?.id, 'lower');
  const fromGauge = resolveRiverSection({ ...base, gaugeSiteId: '07063000' });
  assert.equal(fromGauge.selected?.sectionSlug, reaches[1].sectionSlug);
  assert.equal(resolveRiverSection({ ...base, sectionSlug: 'removed' }).gauge?.id, 'upper');
});

test('deep-link arrival waits for metadata and gauges instead of briefly showing upper water', () => {
  const request = { ...base, sectionSlug: reaches[1].sectionSlug };
  assert.equal(resolveRiverSection({ ...request, reaches: [], source: 'loading' }).state, 'loading');
  assert.equal(resolveRiverSection({ ...request, gauges: [], gaugesReady: false }).state, 'loading');
  assert.equal(resolveRiverSection({ ...request, reaches: [], source: 'missing' }).state, 'unavailable');
  assert.equal(resolveRiverSection({ ...request, reaches: [], source: 'cached', refreshing: true }).state, 'loading');
});

test('an unresolved gauge-only arrival never selects or reads the primary section', () => {
  const request = { ...base, primaryGaugeId: 'upper', gaugeSiteId: '07063000' };
  const legacy = reaches.map(({ sectionSlug, name, riverType, differsFromRiver }) => ({ sectionSlug, name, riverType, differsFromRiver }));
  for (const input of [
    { ...request, gauges: [] },
    { ...request, gauges: [gauges[0]] },
    { ...request, reaches: legacy, source: 'cached' as const },
    { ...request, reaches: [reaches[0], { ...reaches[1], gaugeStationId: null }] },
  ]) {
    const result = resolveRiverSection(input);
    assert.equal(result.state, 'unavailable');
    assert.equal(result.selected, null);
    assert.equal(result.gauge, null);
  }
});

test('a gauge-only arrival waits for its mapping and recovers to the requested section', () => {
  const request = { ...base, primaryGaugeId: 'upper', gaugeSiteId: '07063000' };
  const loading = resolveRiverSection({ ...request, gauges: [], gaugesReady: false });
  assert.equal(loading.state, 'loading');
  assert.equal(loading.selected, null);
  const cached = resolveRiverSection({ ...request, reaches: reaches.map(reach => ({ ...reach, gaugeStationId: null })), source: 'cached', refreshing: true });
  assert.equal(cached.state, 'loading');
  assert.equal(cached.selected, null);
  const recovered = resolveRiverSection(request);
  assert.equal(recovered.state, 'ready');
  assert.equal(recovered.selected?.sectionSlug, reaches[1].sectionSlug);
  assert.equal(recovered.gauge?.id, 'lower');
});

test('an explicit section choice still wins when the arrival gauge cannot be resolved', () => {
  const request = { ...base, primaryGaugeId: 'upper', gaugeSiteId: '07063000', gauges: [] };
  const upper = resolveRiverSection({ ...request, sectionSlug: reaches[0].sectionSlug });
  assert.equal(upper.state, 'ready');
  assert.equal(upper.selected?.sectionSlug, reaches[0].sectionSlug);
  const lower = resolveRiverSection({ ...request, sectionSlug: reaches[1].sectionSlug });
  assert.equal(lower.state, 'unavailable');
  assert.equal(lower.selected?.sectionSlug, reaches[1].sectionSlug);
});

test('missing lower mappings, removed gauges and station IDs never substitute the primary', () => {
  for (const input of [
    { ...base, gauges: [gauges[0]] },
    { ...base, reaches: reaches.map(reach => ({ ...reach, gaugeStationId: null })) },
    { ...base, gauges: [gauges[0], { ...gauges[1], usgsSiteId: null }] },
  ]) {
    const result = resolveRiverSection({ ...input, sectionSlug: reaches[1].sectionSlug });
    assert.equal(result.state, 'unavailable');
    assert.notEqual(result.gauge?.id, 'upper');
  }
});

test('old caches settle to unavailable offline, while current mappings work from cache', () => {
  const legacy = reaches.map(({ sectionSlug, name, riverType, differsFromRiver }) => ({ sectionSlug, name, riverType, differsFromRiver }));
  const request = { ...base, reaches: legacy, source: 'cached' as const, sectionSlug: reaches[1].sectionSlug };
  assert.equal(resolveRiverSection({ ...request, refreshing: true }).state, 'loading');
  assert.equal(resolveRiverSection({ ...request, refreshing: false }).state, 'unavailable');
  assert.equal(resolveRiverSection({ ...request, reaches }).gauge?.id, 'lower');
});

test('the primary section reads the river report when its station cannot be joined', () => {
  const primary = { ...base, primaryGaugeId: 'upper' };
  // /api/gauges failed: the screen stores an empty, settled list.
  const failed = resolveRiverSection({ ...primary, gauges: [] });
  assert.equal(failed.state, 'ready');
  assert.equal(failed.gauge, null);
  assert.equal(failed.selected?.sectionSlug, reaches[0].sectionSlug);
  // Reaches cached before they carried gaugeStationId, once refreshing settles.
  const legacy = reaches.map(({ gaugeStationId: _id, ...reach }) => reach);
  const stale = resolveRiverSection({ ...primary, reaches: legacy, source: 'cached' as const, refreshing: false });
  assert.equal(stale.state, 'ready');
  assert.equal(stale.gauge, null);
  // The lower section still never borrows that water.
  assert.equal(resolveRiverSection({ ...primary, gauges: [], sectionSlug: reaches[1].sectionSlug }).state, 'unavailable');
  assert.equal(resolveRiverSection({ ...primary, reaches: legacy, sectionSlug: reaches[1].sectionSlug }).state, 'unavailable');
});

test('a non-primary or still-loading station is never read as the primary', () => {
  // A section that matches the river but names another station.
  assert.equal(resolveRiverSection({ ...base, gauges: [], primaryGaugeId: 'elsewhere' }).state, 'unavailable');
  // A joined station without a site id is a real gap, not a join failure.
  assert.equal(resolveRiverSection({ ...base, primaryGaugeId: 'upper', gauges: [{ id: 'upper', usgsSiteId: null }] }).state, 'unavailable');
  assert.equal(resolveRiverSection({ ...base, gauges: [], gaugesReady: false, primaryGaugeId: 'upper' }).state, 'loading');
});

test('the upper section links to the dam it does not show; the selector is one compact row', () => {
  const screen = readFileSync('../eddy-ios/app/(tabs)/(today,map,floats,favorites,alerts)/river/[slug].tsx', 'utf8');
  assert.match(screen, /primaryGaugeId: river\?\.primaryGaugeId \?\? null/);
  assert.match(screen, /hasSections && !showDamContext && dam && damSection \? \(/);
  assert.match(screen, /onPress=\{\(\) => selectSection\(damSection\.sectionSlug\)\}/);
  const selector = readFileSync('../eddy-ios/src/components/river/RiverSectionSelector.tsx', 'utf8');
  assert.doesNotMatch(selector, /Choose your section|radio-button-(on|off)/);
  assert.match(selector, /minHeight: 44/);
  assert.match(selector, /accessibilityRole="radio"/);
});

test('ordinary float segments do not replace the gauge picker', () => {
  assert.equal(resolveRiverSection({ ...base, reaches: [] }).state, 'ordinary');
  const ordinary = reaches.map(reach => ({ ...reach, differsFromRiver: false }));
  assert.equal(resolveRiverSection({ ...base, reaches: ordinary }).sections.length, 0);
});

test('dam context follows the selected section; whole tailwaters still show their dam', () => {
  assert.equal(sectionShowsDam(reaches[1].sectionSlug, reaches[0].sectionSlug), false);
  assert.equal(sectionShowsDam(reaches[1].sectionSlug, reaches[1].sectionSlug), true);
  assert.equal(sectionShowsDam(reaches[1].sectionSlug, null), false);
  assert.equal(sectionShowsDam(undefined, null), true);
});

test('old, fallback and late outlooks cannot describe another section', () => {
  const upper = { gaugeStationId: 'upper', read: 'Upper report' };
  const lower = { gaugeStationId: 'lower', read: 'Lower report' };
  assert.equal(sectionOutlook(upper, 'lower'), null);
  assert.equal(sectionOutlook(lower, 'lower'), lower);
  assert.equal(sectionOutlook(lower, 'upper'), null);
  assert.equal(sectionOutlook({}, 'lower'), null);
  assert.equal(sectionOutlook(upper, null), upper);
});

test('only the downstream Black outlook gets release-based weather guidance', () => {
  assert.equal(outlookIsDamControlled('black', '07061500', null), false);
  assert.equal(outlookIsDamControlled('black', '07063000', null), true);
  assert.equal(outlookIsDamControlled('current', '07063000', null), false);
  assert.equal(outlookIsDamControlled('black', null, null), false);
  assert.equal(outlookIsDamControlled('taneycomo', null, 'swl-table-rock-dam'), true);
});

test('native report consumes the configured mapping and shares the selected section', () => {
  const screen = readFileSync('../eddy-ios/app/(tabs)/(today,map,floats,favorites,alerts)/river/[slug].tsx', 'utf8');
  const api = readFileSync('src/lib/data/river-reaches.ts', 'utf8');
  assert.match(api, /gaugeStationId: r\.primary_gauge_station_id \?\? null/);
  assert.match(screen, /outlookFor\?\.key === activeOutlookKey/);
  assert.match(screen, /if \(!canRequestPremium \|\| !slug \|\| reportBlocked\) return/);
  assert.match(screen, /if \(!slug \|\| reportBlocked\) return/);
  assert.match(screen, /section=\$\{encodeURIComponent\(selectedSection\.sectionSlug\)\}/);
  assert.doesNotMatch(screen, /<RiverReaches/);
});
