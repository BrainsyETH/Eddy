import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as generation from '@shared/dam-generation';
import * as scheduleCopy from '@shared/dam-schedule-copy';
import type { DamSnapshot, DamSourceLink } from '@shared/dam-types';
import * as sourceLinks from '../../../eddy-ios/src/lib/damSourceLinks';

// Run the real container with native hosts stubbed. Its child hero can return
// null; that must not leave the container's padded white surface on screen.
function renderCard(dam: DamSnapshot) {
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
    '@/theme/ThemeProvider': { useTheme: () => ({ colors: {}, elevation: () => ({}) }) },
    '@/theme/typography': { fonts: {}, type: {} },
    '@eddy/conditions/dam-generation': generation,
    '@eddy/conditions/dam-schedule-copy': scheduleCopy,
    '@/components/dam/DamGenerationHero': { DamGenerationHero: ({ dam }: { dam: DamSnapshot }) =>
      generation.generationStatusLabel(generation.generationNow(dam)) ? jsx('Hero', {}) : null },
    '@/components/dam/GenerationSchedule': { GenerationSchedule: 'Schedule' },
    '@/components/dam/DamInfoTip': { DamInfoTip: 'Info' },
    // The real selection logic with a stub row: an empty list draws nothing,
    // as the component itself does.
    '@/components/dam/DamSourceLinks': { DamSourceLinks: ({ links }: { links: DamSourceLink[] }) =>
      links.length > 0 ? jsx('Sources', { links }) : null },
    '@/lib/damSourceLinks': sourceLinks,
  };
  const exports: { GenerationCard?: (props: { dam: DamSnapshot }) => unknown } = {};
  const source = readFileSync('../eddy-ios/src/components/dam/GenerationCard.tsx', 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: (name: string) => {
    assert.ok(name in dependencies, `Unexpected generation card dependency: ${name}`);
    return dependencies[name];
  } });
  assert.ok(exports.GenerationCard);
  return { result: exports.GenerationCard({ dam }), nodes };
}

const floodControl: DamSnapshot = {
  id: 'swl-clearwater-dam', name: 'Clearwater Dam', lakeName: 'Clearwater Lake', state: 'MO', lat: 37.13, lon: -90.77,
  hasTurbines: false, generating: null, schedule: [], sources: ['USACE CWMS'],
  metrics: { release: { value: 336, unit: 'cfs', at: '2026-11-11T21:00:00Z', staleness: 'fresh' } },
};

test('flood-control dams with release readings do not render an empty generation card', () => {
  for (const id of ['swl-clearwater-dam', 'mvs-wappapello']) {
    assert.equal(renderCard({ ...floodControl, id }).result, null);
  }
  assert.equal(renderCard({ ...floodControl, metrics: {} }).result, null);
});

test('a powerhouse with missing turbine data retains its generation status card', () => {
  const { result, nodes } = renderCard({ ...floodControl, hasTurbines: true, metrics: {} });
  assert.ok(result);
  assert.equal(nodes.filter(node => node.type === 'Hero').length, 1);
});

test('a schedule without a powerhouse remains visible without an orphan divider', () => {
  const { result, nodes } = renderCard({ ...floodControl, schedule: [{ scheduleDate: '2026-11-11', retrievedAt: null, hours: [], idle: [] }] });
  assert.ok(result);
  assert.equal(nodes.filter(node => node.type === 'Schedule').length, 1);
  assert.equal(nodes.filter(node => node.type === 'Hero').length, 0);
  assert.equal(nodes.filter(node => node.type === 'View').length, 1, 'only the card surface remains');
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
  assert.deepEqual(sourceRows(renderCard({ ...powerhouse, hasTurbines: false }).nodes), [['readings', 'schedule']]);

  // A failed schedule read keeps both pages, and the card keeps its footer for them.
  assert.deepEqual(sourceRows(renderCard({ ...powerhouse, schedule: [] }).nodes), [['readings'], ['schedule']]);
});

test('a payload without source links draws the card exactly as before', () => {
  const { result, nodes } = renderCard({ ...floodControl, hasTurbines: true, metrics: {} });
  assert.ok(result);
  assert.deepEqual(sourceRows(nodes), []);
  assert.equal(nodes.filter(node => node.type === 'View').length, 1, 'no footer is drawn for nothing');
});
