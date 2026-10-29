import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { damWidgetSnapshot } from '../../shared/dam-widget';
import * as generation from '../../shared/dam-generation';
import * as scheduleCopy from '../../shared/dam-schedule-copy';
import { damFavoriteDisplay } from '../../../eddy-ios/src/lib/damFavoriteDisplay';
import type { DamSnapshot } from '../../shared/dam-types';
import { USACE_DAMS, hasPowerhouse } from './flow-providers/usace-registry';

const now = Date.parse('2026-10-17T17:30:00Z'); // 12:30 PM Central
function fixture(): DamSnapshot {
  return {
    id: 'swl-bull-shoals-dam', name: 'Bull Shoals Dam', lakeName: 'Bull Shoals Lake', state: 'AR', lat: 36, lon: -92,
    hasTurbines: true, generationFloorCfs: 100,
    generationReference: { units: 8, fullGenerationCfs: 26400, schedulingCapacityMw: 391, source: 'SWPA' },
    metrics: { generationFlow: { value: 6600, unit: 'cfs', at: new Date(now - 3600_000).toISOString(), staleness: 'fresh' } },
    generating: true,
    schedule: [{ scheduleDate: '2026-10-17', retrievedAt: new Date(now).toISOString(), idle: [],
      hours: Array.from({ length: 24 }, (_, i) => ({ hourEnding: i + 1, megawatts: i < 14 ? 100 : 0, cfs: null, isRamp: false })) }],
    sources: [],
  };
}

test('dam widget keeps observation and schedule separate and expires each locally', () => {
  const packet = damWidgetSnapshot(fixture(), now);
  const first = packet.entries[0];
  assert.equal(first.turbineCfs, 6600);
  assert.equal(first.observedAt, now - 3600_000);
  assert.equal(first.status, 'Generating now');
  assert.match(first.scheduleSummary, /Stops at 2 PM/); // HE15 begins at 2, not 3.
  assert.equal(first.scheduleCheckedAt, now);
  const older = packet.entries.find(entry => entry.date === now + 3600_000 + 1)!;
  assert.equal(older.status, 'Generating at last reading');
  assert.equal(older.turbineCfs, 6600);
  const scheduleExpired = packet.entries.find(entry => entry.date === now + 90 * 60_000 + 1)!;
  assert.equal(scheduleExpired.scheduleCurrent, false);
  assert.match(scheduleExpired.scheduleSummary, /latest schedule/);
  assert.equal(packet.entries.at(-1)!.current, false);
  assert.equal(packet.entries.at(-1)!.scheduleCurrent, false);
  assert.ok(packet.entries.every((entry, i, all) => i === 0 || entry.date > all[i - 1].date));
});

test('missing, daily-average, negative and future turbine readings never mean off', () => {
  for (const bad of [undefined, { ...fixture().metrics.generationFlow!, value: -1 },
    { ...fixture().metrics.generationFlow!, dailyMean: true },
    { ...fixture().metrics.generationFlow!, at: new Date(now + 3600_000).toISOString() }]) {
    const dam = fixture();
    dam.metrics.generationFlow = bad;
    const first = damWidgetSnapshot(dam, now).entries[0];
    assert.equal(first.turbineCfs, null);
    assert.equal(first.observedAt, null);
    assert.equal(first.status, 'Release status unavailable');
  }
  const dam = fixture();
  dam.metrics.generationFlow!.value = 20;
  assert.equal(damWidgetSnapshot(dam, now).entries[0].status, 'No turbine generation observed');
});

test('unknown or stale schedule provenance cannot promise a next transition', () => {
  for (const checked of [null, 'invalid', new Date(now - 91 * 60_000).toISOString(), new Date(now + 3600_000).toISOString()]) {
    const dam = fixture();
    dam.schedule[0].retrievedAt = checked;
    const first = damWidgetSnapshot(dam, now).entries[0];
    assert.equal(first.scheduleCurrent, false);
    assert.doesNotMatch(first.scheduleSummary, /Starts|Stops/);
  }
  const dam = fixture();
  dam.schedule = [];
  assert.equal(damWidgetSnapshot(dam, now).entries[0].scheduleSummary, 'No schedule posted.');
});

test('packaged dam picker matches only registry powerhouses', () => {
  const catalog = JSON.parse(readFileSync(new URL('../../../eddy-ios/modules/eddy-live-activity/widget/DamWidgetCatalog.json', import.meta.url), 'utf8'));
  assert.deepEqual(catalog, Object.values(USACE_DAMS).filter(hasPowerhouse)
    .map(({ id, name, state }) => ({ id, name, state })).sort((a, b) => a.name.localeCompare(b.name)));
});

test('schedule bars preserve published MW, true zero and canonical hour-ending labels', () => {
  const dam = fixture();
  // The schedule's cfs estimate is deliberately irrelevant to the bars.
  dam.schedule[0].hours[13] = { hourEnding: 14, megawatts: 275, cfs: 99999, isRamp: true };
  const packet = damWidgetSnapshot(dam, now);
  assert.equal(packet.scheduleDays[0].date, '2026-10-17');
  assert.equal(packet.scheduleDays[0].hours.length, 24);
  assert.deepEqual(packet.scheduleDays[0].hours[13], { hourEnding: 14, label: '1 PM', megawatts: 275 });
  assert.deepEqual(packet.scheduleDays[0].hours[14], { hourEnding: 15, label: '2 PM', megawatts: 0 });
  assert.equal(packet.entries[0].scheduleHour, 13); // 12:30 PM is HE13.
  assert.equal(packet.entries[0].generationKind, 'generating');
});

test('missing, duplicate, negative and invalid scheduled hours remain gaps rather than zero', () => {
  for (const invalid of ['missing', 'duplicate', -1, NaN, Infinity] as const) {
    const dam = fixture();
    if (invalid === 'missing') dam.schedule[0].hours.splice(5, 1);
    else if (invalid === 'duplicate') dam.schedule[0].hours.push({ ...dam.schedule[0].hours[5] });
    else dam.schedule[0].hours[5].megawatts = invalid;
    const hours = damWidgetSnapshot(dam, now).scheduleDays[0].hours;
    assert.equal(hours.length, 24);
    assert.equal(hours[5].megawatts, null);
    assert.equal(hours[6].megawatts, 100);
  }
});

test('today means the Central calendar day across UTC midnight and DST changes', () => {
  for (const [instant, date, hour] of [
    ['2026-10-18T04:30:00Z', '2026-10-17', 24], // Still Saturday in Central.
    ['2026-10-18T05:00:00Z', '2026-10-18', 1],
    ['2026-03-08T07:30:00Z', '2026-03-08', 2], // 1:30 before spring jump.
    ['2026-03-08T08:30:00Z', '2026-03-08', 4], // 3:30 after spring jump.
    ['2026-11-01T06:30:00Z', '2026-11-01', 2],
    ['2026-11-01T07:30:00Z', '2026-11-01', 2], // Repeated local 1 AM: same posted slot.
  ] as const) {
    const entry = damWidgetSnapshot(fixture(), Date.parse(instant)).entries[0];
    assert.equal(entry.scheduleDate, date);
    assert.equal(entry.scheduleHour, hour);
  }
});

test('cached schedules retain their dates while timeline freshness and midnight change locally', () => {
  const midnight = Date.parse('2026-10-18T05:00:00Z');
  const dam = fixture();
  dam.schedule[0].retrievedAt = new Date(midnight - 1800_000).toISOString();
  const packet = damWidgetSnapshot(dam, midnight - 1800_000);
  const nextDay = packet.entries.find(entry => entry.date === midnight)!;
  assert.equal(nextDay.scheduleDate, '2026-10-18');
  assert.equal(nextDay.scheduleHour, 1);
  assert.equal(nextDay.scheduleCurrent, true);
  // There is no matching day: the client must not relabel yesterday's bars.
  assert.equal(packet.scheduleDays.find(day => day.date === nextDay.scheduleDate), undefined);
  assert.equal(packet.entries.at(-1)!.scheduleCurrent, false);
});

test('dam favorites show the widget turbine reading, not total release or estimated schedule flow', () => {
  const dam = fixture();
  dam.metrics.release = { ...dam.metrics.generationFlow!, value: 9900 };
  dam.schedule[0].hours[12].cfs = 15000;
  dam.schedule[0].hours[12].megawatts = 275;
  const display = damFavoriteDisplay(dam, now);
  assert.equal(display.moment.turbineCfs, 6600);
  assert.equal(display.observedAge, 'an hour ago');
  assert.equal(display.status, 'Generating');
  assert.equal(display.peak, 275);
  assert.match(display.scheduleDescription, /12 PM: 275 megawatts, current hour/);
  assert.match(display.scheduleDescription, /Central time/);
  assert.doesNotMatch(display.scheduleDescription, /subject to change/i);

  delete dam.metrics.generationFlow;
  const missing = damFavoriteDisplay(dam, now);
  assert.equal(missing.moment.turbineCfs, null);
  assert.equal(missing.status, 'Unavailable');
  assert.equal(missing.observedAge, null);
  assert.ok(missing.schedule); // A schedule is independent of the observation.
});

test('dam favorites age observations without hiding today\'s schedule or borrowing another day', () => {
  const dam = fixture();
  const older = damFavoriteDisplay(dam, now + 3 * 3600_000);
  assert.equal(older.status, 'Older reading');
  assert.equal(older.moment.current, false);
  assert.equal(older.schedule?.date, '2026-10-17');
  assert.equal(older.moment.scheduleHour, 16);
  assert.match(older.scheduleDescription, /100 megawatts/);
  dam.schedule[0].scheduleDate = '2026-10-18';
  const tomorrowOnly = damFavoriteDisplay(dam, now);
  assert.equal(tomorrowOnly.schedule, null);
  assert.equal(tomorrowOnly.scheduleNotice, 'Not posted today');
  dam.schedule[0].scheduleDate = '2026-10-16';
  assert.equal(damFavoriteDisplay(dam, now).schedule, null);
  dam.schedule[0].scheduleDate = '2026-10-17';
  const midnight = Date.parse('2026-10-18T05:00:00Z');
  assert.equal(damFavoriteDisplay(dam, midnight).schedule, null);
  dam.schedule = [];
  assert.equal(damFavoriteDisplay(dam, now).scheduleNotice, 'Not posted');
});

test('dam favorites keep today\'s posted hours despite stale or unknown retrieval metadata', () => {
  for (const retrievedAt of [null, 'invalid', new Date(now - 3 * 3600_000).toISOString(), new Date(now + 3600_000).toISOString()]) {
    const dam = fixture();
    dam.schedule[0].retrievedAt = retrievedAt;
    // Even an incomplete cached day preserves its hour positions and gaps.
    dam.schedule[0].hours.splice(5, 1);
    const display = damFavoriteDisplay(dam, now);
    assert.equal(display.moment.scheduleCurrent, false);
    assert.ok(display.schedule);
    assert.equal(display.schedule.date, '2026-10-17');
    assert.equal(display.schedule.hours.length, 24);
    assert.equal(display.schedule.hours[5].megawatts, null);
    assert.equal(display.schedule.hours[6].megawatts, 100);
    assert.equal(display.schedule.hours[14].megawatts, 0);
    assert.equal(display.observedAge, 'an hour ago');
  }
});

test('dam favorites preserve zero generation, unknown hours and projects without a powerhouse', () => {
  const dam = fixture();
  dam.metrics.generationFlow!.value = 0;
  dam.schedule[0].hours.splice(5, 1);
  const display = damFavoriteDisplay(dam, now);
  assert.equal(display.status, 'No generation');
  assert.equal(display.moment.turbineCfs, 0);
  assert.equal(display.schedule!.hours[5].megawatts, null);
  assert.equal(display.schedule!.hours[14].megawatts, 0);
  assert.match(display.scheduleDescription, /5 AM: unavailable/);
  dam.hasTurbines = false;
  assert.equal(damFavoriteDisplay(dam, now).status, 'No powerhouse');
});

test('Favorites renders release flow and age for Clearwater and Wappapello, turbine flow for powerhouses', () => {
  // Execute the screen's actual dam branch and both real card components.
  // Native hosts and hooks are stubbed; checking only the presentation helper
  // missed the regression where the screen chose a turbine-only card for every dam.
  type Element = { type: unknown; props: Record<string, unknown> };
  type Component = (props: Record<string, unknown>) => unknown;
  const nodes: Element[] = [];
  const jsx = (type: unknown, props: Record<string, unknown>) => {
    if (typeof type === 'function') return type(props);
    const element = { type, props };
    nodes.push(element);
    return element;
  };
  const dependencies: Record<string, unknown> = {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    react: { memo: (component: Component) => component, useMemo: (read: () => unknown) => read() },
    'react-native': {
      Pressable: 'Pressable', Text: 'Text', View: 'View',
      StyleSheet: { create: (styles: unknown) => styles },
      useWindowDimensions: () => ({ width: 393, fontScale: 1 }),
    },
    '@/components/ControlIcon': { ControlIcon: 'ControlIcon' },
    '@/components/KindMark': { KindMark: 'KindMark' },
    '@/components/dam/DayBars': { DayBars: 'DayBars' },
    '@/hooks/useObservationClock': { useObservationClock: () => now },
    '@/lib/damFavoriteDisplay': { damFavoriteDisplay },
    '@/theme/ThemeProvider': { useTheme: () => ({ colors: {}, elevation: () => ({}) }) },
    '@/theme/typography': { fonts: {}, type: {} },
    '@/theme/layout': { radii: {} },
    '@eddy/conditions/dam-generation': generation,
    '@eddy/conditions/dam-schedule-copy': scheduleCopy,
  };
  function compile(source: string, context: Record<string, unknown> = {}) {
    const exports: Record<string, Component> = {};
    runInNewContext(ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText, { exports, ...context, require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected card dependency: ${name}`);
      return dependencies[name];
    } });
    return exports;
  }
  const components = Object.assign({}, ...['DamRow', 'DamFavoriteCard'].map(name => compile(
    readFileSync(new URL(`../../../eddy-ios/src/components/dam/${name}.tsx`, import.meta.url), 'utf8')
  )));
  const screen = ts.createSourceFile('favorites.tsx', readFileSync(new URL(
    '../../../eddy-ios/app/(tabs)/(favorites)/favorites.tsx', import.meta.url
  ), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let branch: ts.IfStatement | undefined;
  function visit(node: ts.Node) {
    if (ts.isIfStatement(node) && node.expression.getText(screen) === "item.kind === 'dam'") branch = node;
    ts.forEachChild(node, visit);
  }
  visit(screen);
  assert.ok(branch, 'Favorites must retain a render branch for saved dams');
  const damById = new Map<string, DamSnapshot>();
  const opened: string[] = [];
  const unstarred: string[] = [];
  const render = compile(`export function render(item) { ${branch.getText(screen)} }`, {
    ...components, damById, router: { push: (path: string) => opened.push(path) },
    toggleStar: (item: { entityId: string }) => unstarred.push(item.entityId),
  }).render;
  const text = () => nodes.filter(node => node.type === 'Text')
    .map(node => [node.props.children].flat().join('')).join('\n');

  for (const id of ['swl-clearwater-dam', 'mvs-wappapello']) {
    const registry = USACE_DAMS[id];
    assert.ok(registry, id);
    assert.equal(hasPowerhouse(registry), false);
    assert.ok(registry.series.release);
    for (const value of [4200, 0]) {
      const dam: DamSnapshot = { ...fixture(), id, name: registry.name, hasTurbines: false,
        metrics: { release: { value, unit: 'cfs', at: new Date(now - 3600_000).toISOString(), staleness: 'fresh' } },
        generating: null, schedule: [] };
      damById.set(id, dam);
      nodes.length = 0;
      render({ kind: 'dam', entityId: id });
      assert.ok(text().includes(`${value.toLocaleString()} cfs`), `${id} must retain its release reading`);
      assert.match(text(), /an hour ago/);
      assert.doesNotMatch(text(), /Turbine flow|No powerhouse|Observation unavailable/);
      const star = nodes.find(node => node.props.accessibilityLabel === `Unstar ${dam.name}`);
      assert.ok(star);
      (star.props.onPress as () => void)();
      assert.equal(unstarred.at(-1), id);
      const row = nodes.find(node => node.type === 'Pressable' && !node.props.accessibilityLabel);
      assert.ok(row);
      (row.props.onPress as () => void)();
      assert.equal(opened.at(-1), `/dam/${id}`);
    }
  }
  const powerhouse = fixture();
  powerhouse.metrics.release = { ...powerhouse.metrics.generationFlow!, value: 4200 };
  damById.set(powerhouse.id, powerhouse);
  nodes.length = 0;
  render({ kind: 'dam', entityId: powerhouse.id });
  assert.match(text(), /Turbine flow/);
  assert.match(text(), /6,600/);
  assert.doesNotMatch(text(), /4,200/);

  powerhouse.schedule[0].retrievedAt = new Date(now - 3 * 3600_000).toISOString();
  nodes.length = 0;
  render({ kind: 'dam', entityId: powerhouse.id });
  assert.match(text(), /100 MW/);
  assert.match(text(), /12a/);
  assert.match(text(), /Observed an hour ago/);
  assert.doesNotMatch(text(), /Check schedule|Subject to change/);
  const details = nodes.find(node => node.props.accessibilityHint === 'Opens dam details and the full schedule');
  assert.ok(details);
  assert.match(String(details.props.accessibilityLabel), /12 PM: 100 megawatts, current hour/);
  assert.doesNotMatch(String(details.props.accessibilityLabel), /subject to change/i);
});
