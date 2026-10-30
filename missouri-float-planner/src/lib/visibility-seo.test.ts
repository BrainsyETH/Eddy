import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRouterContext, type AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { ImageConfigContext } from 'next/dist/shared/lib/image-config-context.shared-runtime';
import { imageConfigDefault } from 'next/dist/shared/lib/image-config';
import { accessFeeSchema, publicPageMetadata } from './seo';
import ArticleByline from '../components/blog/ArticleByline';
import ConditionsLayout from '../components/conditions/ConditionsLayout';
import GenerationSchedule from '../components/dam/GenerationSchedule';
import type { ConditionsExplorerProps } from '../components/conditions/ConditionsExplorer';
import { conditionsDamCatalogue } from './conditions/dam-catalogue';
import { normalizeGaugeHistory } from '@shared/history-normalize';
import type { RiverListItem } from '../types/api';
import type { DamScheduleDay } from '@shared/dam-types';

test('Next upgrades require reviewing the copied default crawler list', () => {
  const require = createRequire(import.meta.url);
  assert.equal(require('next/package.json').version, '16.4.3',
    'Next changed: compare its default HTML-limited crawler list with next.config.mjs, then update this version guard.');
});

test('emitted CSP permits public analytics and isolates admin diagrams', async () => {
  const imported = await import(pathToFileURL(resolve('next.config.mjs')).href);
  const config = typeof imported.default === 'function' ? await imported.default('phase-production-build', { defaultConfig: {} }) : imported.default;
  // A banner emitted after </head> is too late for native Safari UI.
  assert.ok(config.htmlLimitedBots.test('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'));
  assert.ok(config.htmlLimitedBots.test('Twitterbot/1.0'));
  assert.ok(config.htmlLimitedBots.test('Google-InspectionTool/1.0'));
  assert.ok(!config.htmlLimitedBots.test('Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36'));
  const rules = await config.headers();
  let policies = 0;
  let guidePolicies = 0;
  for (const rule of rules) {
    for (const header of rule.headers) {
      if (header.key.toLowerCase() !== 'content-security-policy') continue;
      const directives = new Map<string, string[]>(header.value.split(';').map((part: string) => {
        const [key, ...sources] = part.trim().split(/\s+/);
        return [key, sources];
      }));
      if (rule.source === '/admin/visuals/:filename') {
        guidePolicies++;
        assert.equal(rule, rules.at(-1), 'the guide policy must override the general app policy');
        assert.deepEqual(directives.get('default-src'), ["'none'"]);
        assert.deepEqual(directives.get('connect-src'), ["'none'"]);
        assert.deepEqual(directives.get('font-src'), ['data:']);
        assert.deepEqual(directives.get('img-src'), ['data:']);
        assert.deepEqual(directives.get('script-src'), ["'unsafe-inline'"]);
        assert.deepEqual(directives.get('frame-ancestors'), ["'none'"]);
        continue;
      }
      policies++;
      for (const host of ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com', 'https://*.google.com']) {
        assert.ok(directives.get('connect-src')?.includes(host), `${rule.source} blocks ${host}`);
      }
      assert.ok(directives.get('script-src')?.includes('https://www.googletagmanager.com'));
      assert.ok(!directives.get('connect-src')?.includes('*'));
      assert.ok(!directives.get('connect-src')?.includes('https://www.googletagmanager.com'), 'GTM wildcard already includes www');
      assert.ok(!directives.get('connect-src')?.some(host => host.includes('doubleclick.net')));
      assert.deepEqual(directives.get('object-src'), ["'none'"]);
    }
  }
  assert.equal(policies, 2);
  assert.equal(guidePolicies, 1);
});

const directoryRivers: RiverListItem[] = Array.from({ length: 12 }, (_, index) => {
  const slug = index === 0 ? 'current' : `river-${index}`;
  return {
    id: slug, slug, name: index === 0 ? 'Current River' : `River ${index}`, state: 'MO', path: `/rivers/missouri/${slug}`,
    lengthMiles: 100, description: 'Spring-fed Ozark floating.', difficultyRating: 'I', region: 'Ozarks', riverType: 'spring_fed_float', accessPointCount: 12, currentCondition: null,
  };
});

function renderConditions(overrides: Partial<ConditionsExplorerProps> = {}, seed?: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  seed?.(client);
  const noop = () => {};
  const router: AppRouterInstance = { back: noop, forward: noop, refresh: noop, push: noop, replace: noop, prefetch: noop, bfcacheId: 'test' };
  try {
    return renderToStaticMarkup(createElement(QueryClientProvider, { client },
      createElement(ImageConfigContext.Provider, { value: { ...imageConfigDefault, remotePatterns: [{ protocol: 'https', hostname: 'q5skne5bn5nbyxfw.public.blob.vercel-storage.com' }] } },
      createElement(AppRouterContext.Provider, { value: router },
        createElement(SearchParamsContext.Provider, { value: new URLSearchParams() },
          createElement(ConditionsLayout, { rivers: directoryRivers, ...conditionsDamCatalogue([]), renderedAt: Date.now(), ...overrides })))),
    ));
  } finally { client.clear(); }
}

test('the actual Conditions layout links to every destination before JavaScript', () => {
  const html = renderConditions();
  assert.match(html, /<h1[^>]*>Conditions<\/h1>/);
  const directory = html.match(/<section aria-label="A–Z directory"[\s\S]*?<\/section>/)?.[0];
  assert.ok(directory, 'the browsing layout must include the complete directory');
  for (const river of directoryRivers) {
    assert.ok(directory.includes(`href="${river.path}"`), `missing canonical river link: ${river.slug}`);
    assert.ok(directory.includes(river.name));
  }
  for (const dam of conditionsDamCatalogue([]).dams) {
    assert.ok(directory.includes(`href="/dams/${dam.id}"`), `missing dam link: ${dam.id}`);
  }
  assert.equal((directory.match(/<a /g) ?? []).length, directoryRivers.length + conditionsDamCatalogue([]).dams.length);
  assert.doesNotMatch(html, /No rivers found/);
  assert.match(html, /USGS readings can lag actual river conditions/);
  assert.match(html, /Eddy the Otter/);
  assert.doesNotMatch(html, /Show all rivers/);
});

test('All keeps the river chart and Eddy report alongside the dam schedule and essential readings', () => {
  const now = Date.parse('2026-10-27T17:00:00Z');
  const at = new Date(now - 600000).toISOString();
  const river = directoryRivers[0];
  const dam = { ...conditionsDamCatalogue([]).dams.find(item => item.id === 'swl-table-rock-dam')!,
    generationFloorCfs: 100, generationReference: { units: 8, fullGenerationCfs: 20000, schedulingCapacityMw: 400, source: 'SWPA' },
    metrics: { generationFlow: { value: 10000, unit: 'cfs', at, staleness: 'fresh' as const },
      release: { value: 10500, unit: 'cfs', at, staleness: 'fresh' as const },
      tailwaterTempF: { value: 52, unit: 'F', at, staleness: 'fresh' as const },
      tailwaterElevation: { value: 650.25, unit: 'ft', at, staleness: 'fresh' as const } },
    schedule: [{ scheduleDate: '2026-10-27', retrievedAt: at, idle: [], hours: Array.from({ length: 24 }, (_, i) => ({ hourEnding: i + 1, megawatts: i < 14 ? 200 : 400, cfs: i < 14 ? 10000 : 20000, isRamp: i === 14 })) }],
  };
  const html = renderConditions({ rivers: [river], dams: [dam], renderedAt: now }, client => {
    client.setQueryData(['gaugeStations'], [{
      id: 'gauge-current', usgsSiteId: '07067000', name: 'Current River at Van Buren', active: true,
      coordinates: { lat: 37, lng: -91 }, gaugeHeightFt: 3, dischargeCfs: 400, readingTimestamp: at,
      thresholds: [{ riverId: river.id, riverName: river.name, riverSlug: river.slug, isPrimary: true,
        thresholdUnit: 'cfs', levelTooLow: 50, levelLow: 100, levelOptimalMin: 200, levelOptimalMax: 800, levelHigh: 1000, levelDangerous: 2000 }],
    }]);
    client.setQueryData(['eddyUpdates'], {});
    client.setQueryData(['gaugeHistory', '07067000', 14, null, null, 'auto', null], normalizeGaugeHistory({
      siteId: '07067000', readings: [400, 450, 500].map((value, i) => ({ timestamp: new Date(now - (3 - i) * 86400000).toISOString(), dischargeCfs: value, gaugeHeightFt: 3 })),
    }));
  });
  const textContent = html.replace(/<[^>]*>/g, '');
  for (const text of ['Eddy says', 'Full River Report', 'Current River at Van Buren', 'Release', '10,500 cfs', 'Water temp', '52.0 °F', 'Increases at 2 PM.', 'Peak window: 2 PM–midnight', 'Full report']) assert.ok(textContent.includes(text), text);
  assert.match(html, /aria-label="Today’s generation schedule"/);
  assert.doesNotMatch(html, /Generating now|of full generation|Below-dam elevation/);
  assert.match(html, /role="img" aria-label="Flow \(cfs\) trend chart/);
  assert.ok(html.includes('Eddy_the_Otter_'), 'river report keeps its condition-specific Eddy image');
  assert.ok(html.includes('canoe'), 'header keeps Eddy’s canoe artwork');
});

const scheduleDay = (scheduleDate: string, megawatts: number): DamScheduleDay => ({
  scheduleDate, retrievedAt: '2026-10-27T16:50:00Z', idle: [],
  hours: Array.from({ length: 24 }, (_, i) => ({ hourEnding: i + 1, megawatts, cfs: null, isRamp: false })),
});
const scheduledDam = {
  ...conditionsDamCatalogue([]).dams.find(item => item.id === 'swl-table-rock-dam')!,
  generationReference: { units: 8, fullGenerationCfs: 20000, schedulingCapacityMw: 400, source: 'SWPA' },
};

function scheduleSection(html: string, label: 'Today' | 'Tomorrow'): string {
  const section = html.match(new RegExp(`<section aria-label="${label}’s generation schedule"[\\s\\S]*?<\\/section>`))?.[0];
  assert.ok(section, `${label} schedule is server-rendered`);
  return section;
}

test('dam cards render only today on the Central calendar across midnight, DST and year boundaries', () => {
  for (const [instant, today, tomorrow] of [
    ['2026-10-28T03:00:00Z', '2026-10-27', '2026-10-28'],
    ['2026-10-28T05:00:00Z', '2026-10-28', '2026-10-29'],
    ['2026-03-08T05:30:00Z', '2026-03-07', '2026-03-08'],
    ['2026-03-09T04:30:00Z', '2026-03-08', '2026-03-09'],
    ['2026-11-01T05:30:00Z', '2026-11-01', '2026-11-02'],
    ['2026-11-02T05:30:00Z', '2026-11-01', '2026-11-02'],
    ['2027-01-01T05:30:00Z', '2026-12-31', '2027-01-01'],
  ]) {
    const dam = { ...scheduledDam, schedule: [scheduleDay('2026-01-01', 100), scheduleDay(today, 200), scheduleDay(tomorrow, 400), scheduleDay('2027-01-03', 100)] };
    const html = renderConditions({ rivers: [], dams: [dam], renderedAt: Date.parse(instant) });
    assert.equal((html.match(/role="img"/g) ?? []).length, 1, 'exactly one visible timeline');
    const section = scheduleSection(html, 'Today');
    assert.match(section, /aria-label="Generation scheduled for 24 of 24 hours[^"]*Peak scheduled load is 50%/);
    assert.match(section, /Checked /, 'Today keeps its own check age');
    assert.equal((section.match(/data-schedule-now/g) ?? []).length, 1);
    assert.doesNotMatch(html, /aria-label="Tomorrow’s generation schedule"/);
    assert.doesNotMatch(html, /<details|role="tab"/);
    for (const link of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)) assert.ok(!link[0].includes('tabindex="0"'), 'timeline is never nested in a navigation link');
  }
});

test('dam cards distinguish missing Today from idle schedules and retain Today’s stale provenance', () => {
  const renderedAt = Date.parse('2026-10-27T17:00:00Z');
  for (const schedule of [[], [scheduleDay('2026-10-26', 400)], [scheduleDay('2026-10-28', 400)], [{ ...scheduleDay('2026-10-27', 0), hours: [] }]]) {
    const html = renderConditions({ rivers: [], dams: [{ ...scheduledDam, schedule }], renderedAt });
    const today = scheduleSection(html, 'Today');
    assert.match(today, /Today’s generation schedule is unavailable/);
    assert.doesNotMatch(html, /role="img"|No generation scheduled at any hour|aria-label="Tomorrow’s generation schedule"/);
  }
  for (const schedule of [[], [scheduleDay('2026-10-27', 200)], [scheduleDay('2026-10-29', 400)], [{ ...scheduleDay('2026-10-28', 0), hours: [] }]]) {
    const html = renderConditions({ rivers: [], dams: [{ ...scheduledDam, schedule }], renderedAt });
    assert.doesNotMatch(html, /Tomorrow|hasn’t been posted/, 'an unposted day has no heading, date, chart or empty-state block');
  }
  const idle = renderConditions({ rivers: [], dams: [{ ...scheduledDam, schedule: [scheduleDay('2026-10-27', 0), scheduleDay('2026-10-28', 0)] }], renderedAt });
  assert.match(scheduleSection(idle, 'Today'), /role="img" aria-label="No generation scheduled at any hour/);
  assert.doesNotMatch(idle, /aria-label="Tomorrow’s generation schedule"/);
  assert.doesNotMatch(idle, /schedule is unavailable|hasn’t been posted/);
  const stale = renderConditions({ rivers: [], dams: [{ ...scheduledDam, schedule: [{ ...scheduleDay('2026-10-27', 200), retrievedAt: '2026-10-27T10:00:00Z' }, scheduleDay('2026-10-28', 400)] }], renderedAt });
  assert.match(scheduleSection(stale, 'Today'), /May have changed/);
  assert.match(stale, /It may have been revised since/);
  const noTurbines = renderConditions({ rivers: [], dams: [{ ...scheduledDam, hasTurbines: false, schedule: [] }], renderedAt });
  assert.doesNotMatch(noTurbines, /Today’s generation schedule|Tomorrow’s generation schedule/);
});

test('only full generation schedules show posted Tomorrow, including zero and partial days', () => {
  const now = Date.parse('2026-10-27T17:00:00Z');
  const today = scheduleDay('2026-10-27', 200);
  const tomorrow = scheduleDay('2026-10-28', 0);
  const later = scheduleDay('2026-10-29', 400);
  for (const compact of [true, false]) {
    const render = (schedule: DamScheduleDay[]) => renderToStaticMarkup(createElement(GenerationSchedule, {
      schedule, reference: scheduledDam.generationReference, now, compact,
    }));
    for (const schedule of [[today, later], [today, { ...tomorrow, hours: [] }, later]]) {
      const html = render(schedule);
      assert.doesNotMatch(html, /Tomorrow|hasn’t been posted/);
      assert.match(scheduleSection(html, 'Today'), /role="img"/);
      assert.equal(html.includes('<details'), !compact, 'later days retain the full report’s disclosure');
    }
    const idle = render([today, tomorrow]);
    const partial = render([today, { ...tomorrow, hours: [{ ...tomorrow.hours[0], megawatts: 200 }] }]);
    if (compact) {
      for (const html of [idle, partial]) {
        assert.doesNotMatch(html, /aria-label="Tomorrow’s generation schedule"/);
        assert.equal((html.match(/role="img"/g) ?? []).length, 1);
      }
    } else {
      assert.match(scheduleSection(idle, 'Tomorrow'), /No generation scheduled at any hour/);
      assert.match(scheduleSection(partial, 'Tomorrow'), /role="img"/);
      assert.match(scheduleSection(partial, 'Tomorrow'), /border-dashed/, 'missing hours remain gaps in a posted partial day');
    }
  }
});

test('the dams entry uses the shared Conditions heading and links every dam before JavaScript', () => {
  const html = renderConditions({ defaultKind: 'dams' });
  assert.match(html, /<h1[^>]*>Conditions<\/h1>/);
  assert.doesNotMatch(html, /<h1[^>]*>Lakes &amp; Dams<\/h1>/);
  for (const dam of conditionsDamCatalogue([]).dams) assert.ok(html.includes(`href="/dams/${dam.id}"`));
});

test('paid access is never marked free, and unknown fees remain unspecified', () => {
  assert.deepEqual(accessFeeSchema(true), { isAccessibleForFree: false });
  assert.deepEqual(accessFeeSchema(false), { isAccessibleForFree: true });
  assert.deepEqual(accessFeeSchema(null), {});
  assert.deepEqual(accessFeeSchema(undefined), {});
});

test('public metadata names the actual page instead of inheriting the homepage', () => {
  const metadata = publicPageMetadata('Lake Levels', 'Dam release schedules.', '/dams', '/opengraph-image');
  assert.equal(metadata.alternates?.canonical, '/dams');
  assert.equal(metadata.openGraph?.url, '/dams');
  assert.equal(metadata.openGraph?.title, 'Lake Levels');
  assert.equal(metadata.twitter?.title, 'Lake Levels');
  assert.deepEqual(metadata.openGraph?.images, [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Eddy — live river conditions, water levels, and float trip plans' }]);
  assert.deepEqual(metadata.twitter?.images, ['/opengraph-image']);
  const riverMetadata = publicPageMetadata('River Reports', 'Live river levels.', '/rivers');
  assert.ok(!Object.hasOwn(riverMetadata.openGraph!, 'images'), 'preserve route-specific file-based river images');
});

test('guide bylines never interpret operational update timestamps as editorial dates', () => {
  const post = { publishedAt: '2026-07-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' };
  const before = renderToStaticMarkup(createElement(ArticleByline, post));
  const sharedPost = { ...post, updatedAt: '2026-10-04T00:00:00Z' };
  const afterShare = renderToStaticMarkup(createElement(ArticleByline, sharedPost));
  assert.equal(afterShare, before);
  assert.match(before, /Published July 1, 2026/);
  assert.doesNotMatch(before, /Updated|Reviewed|2026-09|2026-10/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(ArticleByline, { publishedAt: null })), /<time/);
});
