import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as generation from '@shared/dam-generation';
import * as scheduleCopy from '@shared/dam-schedule-copy';
import type { DamSnapshot } from '@shared/dam-types';

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
  const { result, nodes } = renderCard({ ...floodControl, schedule: [{ scheduleDate: '2026-11-11', hours: [], idle: [] }] });
  assert.ok(result);
  assert.equal(nodes.filter(node => node.type === 'Schedule').length, 1);
  assert.equal(nodes.filter(node => node.type === 'Hero').length, 0);
  assert.equal(nodes.filter(node => node.type === 'View').length, 1, 'only the card surface remains');
});
