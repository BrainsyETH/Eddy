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
import { accessFeeSchema, publicPageMetadata, ROUTE_SHARE_IMAGE, SHARE_IMAGES } from './seo';
import ArticleByline from '../components/blog/ArticleByline';
import ConditionsLayout from '../components/conditions/ConditionsLayout';
import GenerationSchedule from '../components/dam/GenerationSchedule';
import DamTimeline from '../components/dam/DamTimeline';
import DamGenerationHero from '../components/dam/DamGenerationHero';
import DamListCard from '../components/dam/DamListCard';
import { ScheduleBars } from '../components/embed/v2/DamEmbed';
import { damWidgetSnapshot } from '@shared/dam-widget';
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
  for (const text of ['Eddy says', 'Full river report', 'At Van Buren', 'Van Buren gauge', 'Release', '10,500 cfs', 'Water temp', '52.0 °F', 'Measured 10 min ago', 'Generation scheduled to increase at 2 PM.', 'Highest scheduled generation: 2 PM–midnight', 'Full report']) assert.ok(textContent.includes(text), text);
  // The card leads its schedule with the next move and the peak window, in
  // place of the hours count, each said once and both above the chart.
  const todaySchedule = scheduleSection(html, 'Today');
  const todayText = todaySchedule.replace(/<[^>]*>/g, ' ');
  assert.ok(todayText.indexOf('Generation scheduled to increase at 2 PM.') < todayText.indexOf('Highest scheduled generation: 2 PM–midnight'), 'the next move leads, the peak window follows');
  assert.ok(todaySchedule.indexOf('data-peak-window') < todaySchedule.indexOf('role="img"'), 'both sit above the chart');
  assert.equal((html.match(/Highest scheduled generation:/g) ?? []).length, 1, 'the chart’s at-rest readout does not repeat the peak');
  assert.equal((html.match(/Generation scheduled to increase at 2 PM\./g) ?? []).length, 1, 'the change is not repeated under the chart');
  assert.doesNotMatch(textContent, /Generation scheduled all day/, 'the hours count gives way to the move');
  // Trimmed: no label over the change sentence, no standing instruction, no repeated caveats.
  // River card: the reading is shown once (no chart "Current:" copy), the
  // comparison never says "typical", actions are sentence case.
  assert.ok(textContent.includes('Add photo'));
  for (const text of ['Current:', 'typical', 'Full River Report', 'Add Photo']) assert.ok(!textContent.includes(text), text);
  const riverCard = html.match(/<article[^>]*>(?:(?!<\/article>)[\s\S])*?At Van Buren[\s\S]*?<\/article>/)?.[0] ?? '';
  assert.ok(riverCard, 'the river card renders');
  assert.equal((riverCard.match(/class="inline-flex items-center font-bold rounded-full border /g) ?? []).length, 1, 'one condition badge, not two');
  for (const text of ['Next change', 'Select an hour for details', 'It may have been revised', 'Schedules can change', 'Scheduled to generate']) assert.ok(!textContent.includes(text), text);
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

test('full dam reports lead with total release and keep turbine observations independent', () => {
  const now = Date.parse('2026-11-10T14:20:00Z');
  const at = '2026-11-10T14:00:00Z';
  const turbineAt = '2026-11-10T13:00:00Z';
  const metric = (value: number, time = at) => ({ value, unit: 'cfs', at: time, staleness: 'fresh' as const });
  const dam = { ...scheduledDam, generationFloorCfs: 100,
    metrics: { release: metric(6200), generationFlow: metric(20, turbineAt) },
  };
  const render = (metrics: typeof dam.metrics | { generationFlow: ReturnType<typeof metric>; release?: ReturnType<typeof metric> & { dailyMean?: boolean } }) =>
    renderToStaticMarkup(createElement(DamGenerationHero, { dam: { ...dam, metrics }, now }));
  const html = render(dam.metrics);
  assert.match(html, /data-total-release[^>]*>6,200 /, 'the main value is measured total release, not turbine flow');
  assert.ok(html.indexOf('data-total-release') < html.indexOf('No turbine generation observed'));
  assert.match(html, /Through the turbines <span[^>]*>20 cfs/);
  assert.match(html, /dateTime="2026-11-10T14:00:00Z"/);
  assert.match(html, /dateTime="2026-11-10T13:00:00Z"/, 'older turbine flow retains its own timestamp');

  const missing = render({ generationFlow: metric(6200) });
  assert.match(missing, /Total release unavailable/);
  assert.doesNotMatch(missing, /data-total-release/, 'turbine flow never substitutes for total release');
  assert.match(missing, /Through the turbines <span[^>]*>6,200 cfs/);

  const matching = render({ release: metric(20), generationFlow: metric(20) });
  assert.match(matching, /data-total-release[^>]*>20 /);
  assert.match(matching, /Turbine flow matches total release/);
  assert.equal((matching.match(/<time /g) ?? []).length, 1, 'synchronized readings share one visible time');

  const daily = render({ release: { ...metric(6200, '2026-11-09T14:00:00Z'), dailyMean: true }, generationFlow: metric(20) });
  assert.match(daily, /Total release at dam · Daily average/);
  assert.doesNotMatch(daily, /Turbine flow matches total release/);
  assert.equal((daily.match(/<time /g) ?? []).length, 2, 'daily mean and current turbine flow keep separate dates');
});

test('schedule readout distinguishes an unposted hour and an estimated turbine flow', () => {
  const now = Date.parse('2026-10-27T17:30:00Z'); // noon Central
  const day = scheduleDay('2026-10-27', 200);
  const render = (hours: DamScheduleDay['hours']) => renderToStaticMarkup(createElement(DamTimeline, {
    day: { ...day, hours }, now, reference: scheduledDam.generationReference, plainLanguage: true, peakAtRest: false,
  }));
  assert.match(render(day.hours.filter(h => h.hourEnding !== 13)), /12 PM–1 PM · schedule not posted/);
  assert.match(render(day.hours.map(h => ({ ...h, cfs: 10000 }))), /200 MW scheduled · Est\. turbine flow 10,000 cfs/);
  assert.doesNotMatch(render(day.hours.map(h => ({ ...h, cfs: 10000, isRamp: true }))), /Est\. turbine flow/);
});

function scheduleSection(html: string, label: 'Today' | 'Tomorrow'): string {
  const section = html.match(new RegExp(`<section aria-label="${label}’s generation schedule"[\\s\\S]*?<\\/section>`))?.[0];
  assert.ok(section, `${label} schedule is server-rendered`);
  return section;
}

// Bull Shoals' posted Nov 9 schedule: every hour was below the old 12% floor,
// including the 40 MW peak at HE14 (1–2 PM Central).
const lowOutputDay: DamScheduleDay = {
  scheduleDate: '2026-11-09', retrievedAt: '2026-11-09T23:30:04Z', idle: [],
  hours: [7, 7, 7, 7, 7, 7, 10, 7, 30, 7, 7, 7, 15, 40, 7, 7, 20, 30, 15, 7, 15, 7, 7, 7]
    .map((megawatts, i) => ({ hourEnding: i + 1, megawatts, cfs: null, isRamp: true, minimumFlow: megawatts <= 10 })),
};
const bullShoalsReference = { units: 8, fullGenerationCfs: 26400, schedulingCapacityMw: 391, source: 'SWPA' };

test('low-output schedules retain their capacity-scaled shape and outline the past peak', () => {
  for (const compact of [false, true]) {
    const html = renderToStaticMarkup(createElement(DamTimeline, {
      day: lowOutputDay, reference: bullShoalsReference, now: Date.parse('2026-11-10T00:45:00Z'), plainLanguage: true, compact,
    }));
    const height = (hour: number) => Number(html.match(new RegExp(`data-schedule-hour="${hour}"[^>]*style="height:([\\d.]+)%`))?.[1]);
    assert.ok(height(1) < height(13) && height(13) < height(9) && height(9) < height(14), '7, 15, 30 and 40 MW must not collapse to equal-height bars');
    assert.equal(height(14), 40 / 391 * 100, 'the peak stays at 10.2% of capacity, not rescaled to full height');
    assert.match(html, /6 PM–7 PM · 15 MW scheduled/);
    assert.doesNotMatch(html, /Half capacity/);
    assert.equal(html.includes('data-schedule-scale'), !compact);
    assert.equal((html.match(/data-peak-hour=/g) ?? []).length, 1);
    assert.match(html, /data-peak-hour="14"[^>]*class="[^"]*opacity-90[^"]*ring-1 ring-inset ring-primary-900/);
  }
});

test('full dam reports keep the next change and peak together in the coral callout', () => {
  for (const compact of [false, true]) {
    const html = renderToStaticMarkup(createElement(GenerationSchedule, {
      schedule: [lowOutputDay], reference: bullShoalsReference, now: Date.parse('2026-11-10T00:45:00Z'), compact,
    }));
    const today = scheduleSection(html, 'Today');
    assert.equal(today.includes('border-accent-500 bg-accent-50'), !compact, 'restore the full-report callout without boxing compact cards');
    assert.match(today, /Generation scheduled until 7 PM\. Resumes at 8 PM\./);
    assert.match(today, /Highest scheduled generation: 1–2 PM/);
    assert.equal((html.match(/Generation scheduled until 7 PM/g) ?? []).length, 1);
    assert.ok(today.indexOf('data-peak-window') < today.indexOf('role="img"'));
  }
});

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
    assert.match(html, /data-schedule-check="(current|stale)"[^>]*>(?:<svg[\s\S]*?Outdated: <\/span>)?Schedule checked /, 'one freshness line, as a Central clock time');
    assert.equal((html.match(/data-schedule-check=/g) ?? []).length, 1, 'matching retrievals do not repeat as separate alerts');
    // The card names the day once, as a dateline in its header, before the
    // readings; the schedule section opens with the plan in words under a
    // heading that is spoken only.
    const header = html.match(/<a\b[^>]*href="\/dams\/[^"]*"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? '';
    assert.match(header, /· <span aria-hidden="true">CT<\/span><span class="sr-only">Central time<\/span>/, 'the header carries the day and zone');
    assert.ok(html.indexOf(header) < html.indexOf(section), 'the dateline precedes the schedule');
    assert.equal((html.match(/aria-hidden="true">CT</g) ?? []).length, 1, 'the day is dated once');
    assert.match(section, /<h4 class="sr-only">Today’s generation<\/h4>/, 'the section keeps a spoken heading');
    assert.doesNotMatch(section, /Today’s generation <span/, 'no visible heading row above the plan');
    // A flat all-day schedule holds no move, so the day's headline leads.
    assert.ok(section.replace(/<[^>]*>/g, ' ').indexOf('Generation scheduled all day') < section.indexOf('role="img"'), 'the plan in words is the section’s first line');
    assert.match(section, /data-peak-window[^>]*>Today’s scheduled generation: all day</, 'the peak window follows the headline');
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
  // Today's file is stale; Tomorrow's (which the change line relies on) is not.
  // One line, at the older time, flagged outdated, in the footer corner.
  assert.match(stale, /data-schedule-check="stale"[\s\S]*?Outdated: <\/span>Schedule checked 5:00 AM CDT</);
  assert.equal((stale.match(/data-schedule-check=/g) ?? []).length, 1, 'never a second timestamp');
  assert.match(stale, /Full report[\s\S]*?data-schedule-check="stale"/, 'the check sits after Full report, in the footer');
  assert.match(stale, /data-schedule-check="stale" class="[^"]*amber/, 'outdated freshness is amber, not coral');
  assert.doesNotMatch(stale, /data-schedule-check="[^"]*" class="[^"]*accent/);
  // Minimum flow, no generation and a missing schedule each lead in words.
  const minimumFlow = { ...scheduleDay('2026-10-27', 7), hours: scheduleDay('2026-10-27', 7).hours.map(h => ({ ...h, minimumFlow: true })) };
  const bullShoals = renderConditions({ rivers: [], dams: [{ ...scheduledDam, schedule: [minimumFlow] }], renderedAt });
  const todayText = (html: string) => scheduleSection(html, 'Today').replace(/<[^>]*>/g, ' ');
  assert.ok(scheduleSection(bullShoals, 'Today').indexOf('Only minimum flow scheduled') < scheduleSection(bullShoals, 'Today').indexOf('role="img"'), 'minimum flow leads, above the chart');
  assert.match(todayText(idle), /No generation scheduled/);
  assert.doesNotMatch(todayText(idle), /minimum flow|unavailable/);
  assert.doesNotMatch(todayText(bullShoals), /No generation scheduled|unavailable/);
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
      assert.match(scheduleSection(partial, 'Tomorrow'), /Tomorrow’s generation schedule <span[^>]*>· /);
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
  const metadata = publicPageMetadata('Lake Levels', 'Dam release schedules.', '/dams', SHARE_IMAGES.site);
  assert.equal(metadata.alternates?.canonical, '/dams');
  assert.equal(metadata.openGraph?.url, '/dams');
  assert.equal(metadata.openGraph?.title, 'Lake Levels');
  assert.equal(metadata.twitter?.title, 'Lake Levels');
  assert.deepEqual(metadata.openGraph?.images, [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Eddy — live river conditions, water levels, and float trip plans' }]);
  assert.deepEqual(metadata.twitter?.images, [{ url: '/opengraph-image', alt: 'Eddy — live river conditions, water levels, and float trip plans' }]);
  const riverMetadata = publicPageMetadata('River Reports', 'Live river levels.', '/rivers', ROUTE_SHARE_IMAGE);
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

test('dam card readings show one age line: shared only when both were observed in the same minute', () => {
  const now = Date.parse('2026-11-02T00:40:00Z');
  const reading = (value: number, minutesAgo: number) => ({ value, unit: 'cfs', at: new Date(now - minutesAgo * 60_000).toISOString(), staleness: 'fresh' as const });
  const render = (tempMinutesAgo: number) => renderToStaticMarkup(createElement(DamListCard, {
    dam: { ...scheduledDam, metrics: { release: reading(812, 18), tailwaterTempF: reading(54.3, tempMinutesAgo) } }, now, href: '/dams/x',
  })).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const shared = render(18);
  assert.equal((shared.match(/min ago/g) ?? []).length, 1);
  assert.match(shared, /Measured 18 min ago/);
  const separate = render(75);
  assert.match(separate, /Release 18 min ago · Temp 1 hr ago/, 'still one line, but each reading keeps its own age');
  assert.doesNotMatch(separate, /Measured/);
});

// ── A card says why it has no schedule, and which readings a dam never has ──
//
// Every dam with a powerhouse drew the schedule section, so Bagnell and the
// three Nashville District dams read "Today's generation schedule is
// unavailable" on every visit, as though a feed were down, and Stockton showed
// three readings "Unavailable" that Eddy has no source for. Those read "Not
// available in Eddy", never "Not published": the Corps publishes Stockton's pool
// and outflow on a site Eddy does not read, so the registry cannot speak for it.

test('dam cards tell "no hourly schedule" from "schedule missing", and "not available in Eddy" from "unavailable"', async () => {
  const { buildSnapshot } = await import('./data/dams');
  const { USACE_DAMS } = await import('./flow-providers/usace-registry');
  const { directoryUnsupportedReadings } = await import('./data/dam-directory-source');
  const now = Date.parse('2026-11-09T22:00:00Z'); // 4 PM CST
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  const unsupported = directoryUnsupportedReadings();
  const text = (id: string, over: Partial<ReturnType<typeof buildSnapshot>> = {}, directory = true) =>
    renderToStaticMarkup(createElement(DamListCard, {
      dam: { ...buildSnapshot(USACE_DAMS[id], {}, [], undefined, undefined, now), ...over }, now, href: `/dams/${id}`,
      ...(directory ? { showLakeLevel: true, unsupported: unsupported[id] } : {}),
    })).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  // Bagnell: no hourly schedule, and Eddy has no water temperature source.
  const bagnell = text('ameren-bagnell-dam', { metrics: { release: { value: 914, unit: 'cfs', at: at(50), staleness: 'fresh' } } });
  assert.match(bagnell, /No hourly schedule published Releases can begin at any time\./);
  assert.doesNotMatch(bagnell, /schedule is unavailable/);
  assert.match(bagnell, /Water temp Not available in Eddy/);
  assert.match(bagnell, /Lake level Unavailable/, 'Eddy does read the lake level from Ameren, so a missing one is an outage');
  assert.doesNotMatch(bagnell, /· CT/, 'no schedule date in the header of a card with no schedule');

  // Wolf Creek: no SWPA sheet, but the Corps forecast says what comes next.
  const forecast = {
    timeZone: 'America/Chicago', retrievedAt: at(20), source: 'U.S. Army Corps of Engineers, Nashville District',
    windows: [
      { startUtc: at(120), endUtc: new Date(now + 5 * 3_600_000).toISOString(), generating: true, peakCfs: 15_800 },
      { startUtc: new Date(now + 5 * 3_600_000).toISOString(), endUtc: new Date(now + 8 * 86_400_000).toISOString(), generating: false, peakCfs: null },
    ],
  };
  const wolfCreek = text('lrn-wolf-creek-dam', { generationForecast: forecast });
  assert.match(wolfCreek, /Generation forecast to stop at 9 PM\. Corps operating forecast, not a posted schedule\. Central time, at the dam\. Subject to change · Downstream timing varies/);
  assert.doesNotMatch(wolfCreek, /schedule is unavailable/);
  // The forecast carries its own check time; "Measured…" above dates the readings only.
  assert.match(wolfCreek, /Forecast checked 3:40 PM CST/);
  assert.doesNotMatch(wolfCreek, /Schedule checked/);
  const oldFetch = text('lrn-wolf-creek-dam', { generationForecast: { ...forecast, retrievedAt: at(200) } });
  assert.match(oldFetch, /Outdated: Forecast checked/, 'a forecast fetched hours ago says so');
  assert.match(text('lrn-wolf-creek-dam', { generationForecast: { ...forecast, retrievedAt: null } }), /Forecast check time unavailable/);
  // A forecast that has stopped being refreshed states no change.
  const shortHorizon = { ...forecast, windows: [forecast.windows[0], { ...forecast.windows[1], endUtc: new Date(now + 2 * 86_400_000).toISOString() }] };
  const fallback = text('lrn-wolf-creek-dam', { generationForecast: shortHorizon });
  assert.match(fallback, /No hourly schedule published The full report has the Corps operating forecast\./);
  assert.doesNotMatch(fallback, /Forecast checked/, 'no check time for a forecast the card does not state');
  // On surfaces fed by summaries, which carry no forecast, it still does not claim an outage.
  assert.match(text('lrn-wolf-creek-dam', {}, false), /No hourly schedule published/);

  // Clearwater has no powerhouse.
  const clearwater = text('swl-clearwater-dam');
  assert.match(clearwater, /Gate-operated releases No powerhouse, so there is no generation schedule\./);
  assert.match(clearwater, /Water temp Not available in Eddy/);

  // Table Rock IS scheduled: with no stored row it is a missing sheet, never "no schedule published".
  const tableRock = text('swl-table-rock-dam');
  assert.match(tableRock, /Today’s generation schedule is unavailable\./);
  assert.doesNotMatch(tableRock, /No hourly schedule published/);
  assert.match(tableRock, /Release Unavailable/);
  assert.doesNotMatch(tableRock, /Not available in Eddy/);

  // Eddy has no source for Stockton's three readings; its schedule is real.
  const stockton = text('nwk-stockton-dam');
  assert.equal((stockton.match(/Not available in Eddy/g) ?? []).length, 3);
  assert.doesNotMatch(stockton, /Not published/, 'no claim about what the Corps publishes');
  assert.doesNotMatch(stockton, /No hourly schedule published/);

  // Without the registry facts a card keeps the cautious word.
  assert.match(text('nwk-stockton-dam', {}, false), /Release Unavailable/);
});

test('a daily-average release stays labelled in the three-up band', async () => {
  const { buildSnapshot } = await import('./data/dams');
  const { USACE_DAMS } = await import('./flow-providers/usace-registry');
  const now = Date.parse('2026-11-09T22:00:00Z');
  const release = { value: 610, unit: 'cfs', at: new Date(now - 16 * 3_600_000).toISOString(), staleness: 'lagging' as const, dailyMean: true };
  const render = (showLakeLevel: boolean) => renderToStaticMarkup(createElement(DamListCard, {
    dam: buildSnapshot(USACE_DAMS['mvs-wappapello'], { release }, [], undefined, undefined, now), now, href: '/dams/x', showLakeLevel,
  })).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  assert.match(render(true), /Release 610 cfs daily avg/);
  assert.match(render(false), /Release \(daily avg\) 610 cfs/);
});


test('website and embedded schedules give flat output the same meaning and capacity scale', () => {
  const dam = { ...scheduledDam, schedule: [scheduleDay('2026-10-27', 33)],
    generationReference: { units: 2, fullGenerationCfs: 7200, schedulingCapacityMw: 92, source: 'SWPA' } };
  const now = Date.parse('2026-10-27T17:00:00Z');
  const web = renderToStaticMarkup(createElement(GenerationSchedule, {
    schedule: dam.schedule, reference: dam.generationReference, now, compact: true,
  }));
  assert.match(web, /Today’s scheduled generation: all day/);
  assert.doesNotMatch(web, /Highest scheduled generation|data-peak-hour/);
  assert.match(web, /height:35\.869565217391305%/);
  const packet = damWidgetSnapshot(dam, now);
  const embed = renderToStaticMarkup(createElement(ScheduleBars, {
    day: packet.scheduleDays[0], currentHour: 13, label: 'Today',
  }));
  assert.match(embed, /Scheduled generation: all day/);
  assert.match(embed, /0–92 MW/);
  assert.match(embed, /height:25\.82608695652174px/);
  assert.doesNotMatch(embed, /Peak 33/);
});
