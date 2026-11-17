import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as generation from '@shared/dam-generation';
import * as scheduleCopy from '@shared/dam-schedule-copy';
import type { DamScheduleDay, DamSnapshot, DamSourceLink } from '@shared/dam-types';
import * as sourceLinks from '../../../eddy-ios/src/lib/damSourceLinks';

// Run the real container with native hosts stubbed. Its child hero can return
// null; that must not leave the container's padded white surface on screen.
function renderCard(dam: DamSnapshot, now = Date.now()) {
  const nodes: { type: unknown; props: Record<string, unknown> }[] = [];
  const jsx = (type: unknown, props: Record<string, unknown>) => {
    if (typeof type === 'function') return type(props);
    const node = { type, props };
    nodes.push(node);
    return node;
  };
  const dependencies: Record<string, unknown> = {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { View: 'View', Text: 'Text', StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 } },
    '@/theme/layout': { radii: {} },
    '@/theme/ThemeProvider': { useTheme: () => ({ colors: { textMuted: 'muted', accent: 'coral', error: 'red' }, elevation: () => ({}) }) },
    '@/theme/typography': { fonts: {}, type: {} },
    '@eddy/conditions/dam-generation': generation,
    '@eddy/conditions/dam-schedule-copy': scheduleCopy,
    '@/components/dam/DamGenerationHero': { DamGenerationHero: (props: { dam: DamSnapshot }) =>
      props.dam.hasTurbines || props.dam.metrics.release ? jsx('Hero', props) : null },
    '@/components/CollapsibleSection': { CollapsibleSection: 'Day' },
    '@/components/dam/DayBars': { DayBars: 'DayBars', nowSentence: () => null },
    '@/components/dam/DamInfoTip': { DamInfoTip: 'Info' },
    // The real selection logic with a stub row: an empty list draws nothing,
    // as the component itself does.
    '@/components/dam/DamSourceLinks': { DamSourceLinks: ({ links }: { links: DamSourceLink[] }) =>
      links.length > 0 ? jsx('Sources', { links }) : null },
    '@/lib/damSourceLinks': sourceLinks,
  };
  const scheduleExports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(readFileSync('../eddy-ios/src/components/dam/GenerationSchedule.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports: scheduleExports, require: (name: string) => {
    assert.ok(name in dependencies, `Unexpected schedule dependency: ${name}`);
    return dependencies[name];
  } });
  dependencies['@/components/dam/GenerationSchedule'] = scheduleExports;
  const exports: { GenerationCard?: (props: { dam: DamSnapshot; now: number }) => unknown } = {};
  const source = readFileSync('../eddy-ios/src/components/dam/GenerationCard.tsx', 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: (name: string) => {
    assert.ok(name in dependencies, `Unexpected generation card dependency: ${name}`);
    return dependencies[name];
  } });
  assert.ok(exports.GenerationCard);
  return { result: exports.GenerationCard({ dam, now }), nodes };
}

const floodControl: DamSnapshot = {
  id: 'swl-clearwater-dam', name: 'Clearwater Dam', lakeName: 'Clearwater Lake', state: 'MO', lat: 37.13, lon: -90.77,
  hasTurbines: false, generating: null, schedule: [], sources: ['USACE CWMS'],
  metrics: { release: { value: 336, unit: 'cfs', at: '2026-11-11T21:00:00Z', staleness: 'fresh' } },
};

test('flood-control dams lead with release readings without an empty generation card', () => {
  for (const id of ['swl-clearwater-dam', 'mvs-wappapello']) {
    const { result, nodes } = renderCard({ ...floodControl, id });
    assert.ok(result);
    assert.equal(nodes.filter(node => node.type === 'Hero').length, 1);
    assert.equal(nodes.filter(node => node.type === 'Day').length, 0);
  }
  assert.equal(renderCard({ ...floodControl, metrics: {} }).result, null);
});

test('a powerhouse with missing turbine data retains its generation status card', () => {
  const { result, nodes } = renderCard({ ...floodControl, hasTurbines: true, metrics: {} });
  assert.ok(result);
  assert.equal(nodes.filter(node => node.type === 'Hero').length, 1);
});

test('a schedule without a powerhouse remains visible without an orphan divider', () => {
  const { result, nodes } = renderCard({ ...floodControl, metrics: {}, schedule: [{ scheduleDate: '2026-11-11', retrievedAt: null, hours: [], idle: [] }] });
  assert.ok(result);
  assert.equal(nodes.filter(node => node.type === 'Day').length, 1);
  assert.equal(nodes.filter(node => node.type === 'Hero').length, 0);
  assert.match(words(result), /Schedule check time unavailable/);
  assert.equal(nodes.filter(node => node.type === 'View').some(node =>
    JSON.stringify(node.props.style ?? {}).includes('borderTopWidth')), false, 'no divider without an observed half');
});

const corps: DamSourceLink = { kind: 'readings', label: 'Corps of Engineers data', publisher: 'U.S. Army Corps of Engineers', url: 'https://water.usace.army.mil/overview/swl/locations/bull_shoals_dam' };
const swpa: DamSourceLink = { kind: 'schedule', label: 'SWPA schedule', publisher: 'Southwestern Power Administration', url: 'https://www.energy.gov/swpa/generation-schedules' };
const sourceRows = (nodes: { type: unknown; props: Record<string, unknown> }[]) =>
  // Array.from: the card runs in its own VM realm, and its arrays are not this realm's.
  nodes.filter(node => node.type === 'Sources').map(node => Array.from(node.props.links as DamSourceLink[], link => link.kind));

test('each publisher’s page sits in the half of the card it sources', () => {
  const day = { scheduleDate: '2026-11-11', retrievedAt: '2026-11-11T12:00:00Z', hours: [], idle: [] };
  const powerhouse = { ...floodControl, hasTurbines: true, schedule: [day], sourceLinks: [corps, swpa] };
  // Observed half first, then the footer beside the check time.
  assert.deepEqual(sourceRows(renderCard(powerhouse).nodes), [['readings'], ['schedule']]);

  // No observed half to sit under: the operator's page joins the footer.
  assert.deepEqual(sourceRows(renderCard({ ...powerhouse, hasTurbines: false, metrics: {} }).nodes), [['readings', 'schedule']]);

  // A failed schedule read keeps both pages, and the card keeps its footer for them.
  assert.deepEqual(sourceRows(renderCard({ ...powerhouse, schedule: [] }).nodes), [['readings'], ['schedule']]);
});

test('a payload without source links draws the card exactly as before', () => {
  const { result, nodes } = renderCard({ ...floodControl, hasTurbines: true, metrics: {} });
  assert.ok(result);
  assert.deepEqual(sourceRows(nodes), []);
  assert.equal(nodes.filter(node => node.type === 'View').length, 1, 'no footer is drawn for nothing');
});

// Render the real release/turbine hierarchy, stubbing native hosts only.
function renderHero(dam: DamSnapshot): string {
  type Node = { type: unknown; props: { children?: unknown } };
  const jsx = (type: unknown, props: Node['props']): unknown =>
    typeof type === 'function' ? type(props) : { type, props };
  const dependencies: Record<string, unknown> = {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { View: 'View', Text: 'Text', StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 } },
    '@/components/ControlIcon': { ControlIcon: 'Icon' },
    '@/components/EddySymbol': { EddySymbol: 'Symbol' },
    '@/theme/ThemeProvider': { useTheme: () => ({ colors: {} }) },
    '@/theme/typography': { fonts: {}, type: {} },
    '@eddy/conditions/dam-generation': generation,
    '@eddy/conditions/dam-schedule-copy': scheduleCopy,
  };
  const exports: { DamGenerationHero?: (props: { dam: DamSnapshot; now: number }) => unknown } = {};
  const source = readFileSync('../eddy-ios/src/components/dam/DamGenerationHero.tsx', 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: (name: string) => {
    assert.ok(name in dependencies, `Unexpected hero dependency: ${name}`);
    return dependencies[name];
  } });
  assert.ok(exports.DamGenerationHero);
  return words(exports.DamGenerationHero({ dam, now: Date.now() })).replace(/\s+/g, ' ').trim();
}

function words(node: unknown): string {
  if (Array.isArray(node)) return node.map(words).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (node && typeof node === 'object' && 'props' in node) return words((node as { props: { children?: unknown } }).props.children);
  return '';
}

test('native total release leads even when idle turbines report a different number and time', () => {
  const now = Date.now();
  const metric = (value: number, minutesAgo = 20) => ({ value, unit: 'cfs', at: new Date(now - minutesAgo * 60_000).toISOString(), staleness: 'fresh' as const });
  const dam = { ...floodControl, hasTurbines: true, generationFloorCfs: 100,
    metrics: { release: metric(6200), generationFlow: metric(20, 80) } };
  const content = renderHero(dam);
  assert.match(content, /^Total release 6,200 cfs Read /);
  assert.match(content, /Through the turbines 20 cfs/);
  assert.equal((content.match(/Read /g) ?? []).length, 2, 'each observation retains its own time');
  assert.doesNotMatch(content, /Not through turbines/, 'undeclared or misaligned observations are never subtracted');

  const missing = renderHero({ ...dam, metrics: { generationFlow: metric(6200) } });
  assert.match(missing, /^Total release Total release unavailable/);
  assert.match(missing, /Through the turbines 6,200 cfs/);

  const matching = renderHero({ ...dam, metrics: { release: metric(20), generationFlow: metric(20) } });
  assert.doesNotMatch(matching, /Turbine flow matches|Through the turbines/);
  assert.equal((matching.match(/Read /g) ?? []).length, 1);

  const generating = renderHero({ ...dam, generationReference: reference,
    metrics: { release: metric(2734), generationFlow: metric(2734) } });
  assert.match(generating, /Generating now/);
  assert.match(generating, /~\s*18%\s+of full generation/);
  assert.doesNotMatch(generating, /Through the turbines|Turbine flow matches/);

  const differentTime = renderHero({ ...dam, metrics: { release: metric(20), generationFlow: metric(20, 22) } });
  assert.match(differentTime, /Through the turbines 20 cfs/);
  assert.equal((differentTime.match(/Read /g) ?? []).length, 2, 'nearby timestamps still retain the distinct observation');

  const daily = renderHero({ ...dam, metrics: { release: { ...metric(6200, 1440), dailyMean: true }, generationFlow: metric(20) } });
  assert.match(daily, /Daily average/);
  assert.doesNotMatch(daily, /Turbine flow matches total release/);
  assert.equal((daily.match(/Read /g) ?? []).length, 2);

  const stale = renderHero({ ...dam, metrics: { release: metric(6200, 1440), generationFlow: metric(20) } });
  assert.match(stale, /Outdated release reading/);
  assert.doesNotMatch(stale, /Outdated turbine reading/);
  const flood = renderHero({ ...floodControl, metrics: { release: metric(336) } });
  assert.match(flood, /^Total release 336 cfs/);
  assert.doesNotMatch(flood, /turbine|generation/i);
});

const scheduleNow = Date.parse('2026-11-17T03:05:00Z'); // Nov 16, 9:05 PM Central.
function postedDay(load: (hourEnding: number) => number, minimumFlow = false): DamScheduleDay {
  return {
    scheduleDate: '2026-11-16', retrievedAt: '2026-11-17T01:32:00Z', idle: [],
    hours: Array.from({ length: 24 }, (_, i) => ({
      hourEnding: i + 1, megawatts: load(i + 1), cfs: null, isRamp: false, minimumFlow,
    })),
  };
}
const reference = { units: 4, fullGenerationCfs: 15000, schedulingCapacityMw: 230, source: 'SWPA' as const };

test('the native posted plan grades its single check time by age without claiming the plan changed', () => {
  const day = postedDay(h => h >= 6 && h <= 9 ? 230 : h === 5 || h === 10 ? 115 : 0);
  const dam = { ...floodControl, hasTurbines: true, generationReference: reference, sourceLinks: [corps, swpa], schedule: [day] };
  const content = words(renderCard(dam, scheduleNow).result).replace(/\s+/g, ' ');
  assert.match(content, /No further generation posted/);
  assert.doesNotMatch(content, /Next scheduled change/);
  assert.match(content, /Peak 5–9 AM/);
  assert.equal((content.match(/Schedule checked/g) ?? []).length, 1);
  assert.doesNotMatch(content, /Outdated schedule|may have changed/);
  assert.match(content, /7:32 PM CST/);

  const fresh = words(renderCard({ ...dam, schedule: [{ ...day, retrievedAt: '2026-11-17T02:55:00Z' }] }, scheduleNow).result);
  assert.doesNotMatch(fresh, /Outdated schedule/);
  const unknown = words(renderCard({ ...dam, schedule: [{ ...day, retrievedAt: null }] }, scheduleNow).result);
  assert.match(unknown, /Schedule check time unavailable/);
  assert.doesNotMatch(unknown, /Schedule checked|Outdated schedule/);

  const oldest = words(renderCard({ ...dam, schedule: [
    { ...day, retrievedAt: '2026-11-17T02:55:00Z' },
    { ...day, scheduleDate: '2026-11-17' },
  ] }, scheduleNow).result);
  assert.match(oldest, /Schedule checked 7:32 PM CST/);
  assert.doesNotMatch(oldest, /Outdated schedule|may have changed/);

  const checkNode = (schedule: DamScheduleDay[]) => renderCard({ ...dam, schedule }, scheduleNow).nodes.find(node =>
    node.type === 'Text' && typeof node.props.children === 'string' && node.props.children.startsWith('Schedule check'))!;
  const color = (node: ReturnType<typeof checkNode>) => Object.assign({}, ...node.props.style as object[]).color;
  for (const [age, expected] of [[0, 'muted'], [90, 'muted'], [91, 'coral'], [180, 'coral'], [181, 'red']] as const) {
    const check = checkNode([{ ...day, retrievedAt: new Date(scheduleNow - age * 60_000).toISOString() }]);
    assert.equal(color(check), expected, `check age ${age} minutes`);
    if (age > 90) assert.match(String(check.props.accessibilityLabel), /Last checked .+ ago/);
  }
  const oldestDay = { ...day, scheduleDate: '2026-11-17', retrievedAt: new Date(scheduleNow - 240 * 60_000).toISOString() };
  assert.equal(color(checkNode([day, oldestDay])), 'red', 'oldest displayed day determines age');
  for (const retrievedAt of [null, 'invalid']) {
    const unknownCheck = checkNode([{ ...day, retrievedAt }, oldestDay]);
    assert.equal(color(unknownCheck), 'muted', 'an unknown day cannot borrow another day’s age');
    assert.equal(unknownCheck.props.children, 'Schedule check time unavailable');
    assert.equal(unknownCheck.props.accessibilityLabel, undefined);
  }
});

test('a quieter schedule still distinguishes upcoming changes, minimum flow, flat output and missing hours', () => {
  const render = (day: DamScheduleDay) => words(renderCard({
    ...floodControl, generationReference: reference, schedule: [day],
  }, scheduleNow).result).replace(/\s+/g, ' ');
  const next = render(postedDay(h => h >= 23 ? 230 : 0));
  assert.match(next, /Next scheduled change Generation starts at 10 PM/);
  assert.match(next, /Scheduled generation 10 PM–midnight/);
  assert.doesNotMatch(next, /No further generation|Peak/);
  const minimum = render(postedDay(() => 10, true));
  assert.match(minimum, /Only minimum flow for the rest of the posted schedule/);
  assert.doesNotMatch(minimum, /No further generation|Next scheduled change/);
  const running = render(postedDay(() => 230));
  assert.match(running, /Generation continues through the end of the posted schedule/);
  assert.doesNotMatch(running, /No further generation|Next scheduled change|Peak/);
  const missing = postedDay(() => 0);
  missing.hours = missing.hours.filter(h => h.hourEnding !== 22);
  assert.doesNotMatch(render(missing), /No further generation|Next scheduled change/);
});
