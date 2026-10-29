import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as generation from '@shared/dam-generation';
import { patternRows } from '@shared/dam-generation';
import type { DamPatternDay, DamScheduleDay } from '@shared/dam-types';
import { PATTERN_TIME_TICKS, patternTimeTicks } from './dam-pattern-time';

function day(date: string, startUtc: string, count: number): DamPatternDay {
  return { scheduleDate: date, startUtc, turbineCfs: Array(count).fill(1000), totalReleaseCfs: Array(count).fill(1000) };
}
function schedule(date: string): DamScheduleDay {
  return { scheduleDate: date, retrievedAt: `${date}T12:00:00Z`, idle: [], hours: Array.from({ length: 24 }, (_, i) => ({ hourEnding: i + 1, megawatts: 100, cfs: 1000, isRamp: false })) };
}

test('ordinary observed and future days align with the shared six-hour ruler', () => {
  const now = Date.parse('2026-10-28T18:00:00Z');
  const observed = day('2026-10-27', '2026-10-27T05:00:00Z', 24);
  const rows = patternRows([observed], [schedule('2026-10-29')], undefined, 100, now);
  assert.deepEqual(patternTimeTicks(rows[0], observed.startUtc, now), PATTERN_TIME_TICKS);
  assert.deepEqual(patternTimeTicks(rows[1], undefined, now), PATTERN_TIME_TICKS);
});

for (const [date, startUtc, count, nextDay, indices] of [
  ['2026-03-08', '2026-03-08T06:00:00Z', 23, '2026-03-09T18:00:00Z', [0, 5, 11, 17, 23]],
  ['2026-11-01', '2026-11-01T05:00:00Z', 25, '2026-11-02T18:00:00Z', [0, 7, 13, 19, 25]],
] as const) {
  test(`${count}-hour history places Central-time labels on the correct observed cells`, () => {
    const observed = day(date, startUtc, count);
    const now = Date.parse(nextDay);
    const [row] = patternRows([observed], [], undefined, 100, now);
    assert.deepEqual(patternTimeTicks(row, startUtc, now).map(tick => tick.position), indices.map(i => i / count));
  });
}

for (const [date, startUtc, count, instant, indices] of [
  ['2026-03-08', '2026-03-08T06:00:00Z', 23, '2026-03-08T13:00:00Z', [0, 5, 11, 17, 23]],
  ['2026-11-01', '2026-11-01T05:00:00Z', 25, '2026-11-01T14:00:00Z', [0, 7, 13, 19, 25]],
] as const) {
  test(`${count}-hour today aligns observed and upcoming hours on either side of now`, () => {
    const observed = day(date, startUtc, count);
    const now = Date.parse(instant);
    const [row] = patternRows([observed], [schedule(date)], undefined, 100, now);
    assert.deepEqual(patternTimeTicks(row, startUtc, now).map(tick => tick.position), indices.map(i => i / count));
  });
}

test('an unavailable anchor keeps a usable standard ruler', () => {
  const now = Date.parse('2026-10-28T18:00:00Z');
  const [row] = patternRows([day('2026-10-27', 'invalid', 24)], [], undefined, 100, now);
  assert.deepEqual(patternTimeTicks(row, 'invalid', now), PATTERN_TIME_TICKS);
});

// Render the native component with host/hook stubs. Shared row-builder tests
// alone cannot catch the screen filtering scheduled rows until a button tap.
function renderNativePattern(pattern: DamPatternDay[], schedule: DamScheduleDay[], fontScale = 1) {
  const nodes: { type: unknown; props: Record<string, unknown> }[] = [];
  const jsx = (type: unknown, props: Record<string, unknown>) => {
    if (typeof type === 'function') return type(props);
    const node = { type, props };
    nodes.push(node);
    return node;
  };
  const dependencies: Record<string, unknown> = {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    react: {
      useMemo: (read: () => unknown) => read(),
      useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, () => {}],
      useEffect: () => {},
    },
    'react-native': {
      View: 'View', Text: 'Text', Pressable: 'Pressable',
      StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
      useWindowDimensions: () => ({ width: 393, fontScale }),
    },
    '@/theme/ThemeProvider': { useTheme: () => ({ colors: {}, elevation: () => ({}) }) },
    '@/theme/typography': { fonts: {}, textStyles: {} },
    '@/theme/layout': { radii: {} },
    '@/components/dam/DamInfoTip': { DamInfoTip: 'DamInfoTip' },
    '@eddy/conditions/dam-generation': generation,
  };
  const exports: { DamPatternStrip?: (props: { pattern: DamPatternDay[]; schedule: DamScheduleDay[] }) => unknown } = {};
  const source = readFileSync('../eddy-ios/src/components/dam/DamPatternStrip.tsx', 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, Date: { now: () => Date.parse('2026-10-28T18:00:00Z') }, require: (name: string) => {
    assert.ok(name in dependencies, `Unexpected pattern dependency: ${name}`);
    return dependencies[name];
  } });
  assert.ok(exports.DamPatternStrip);
  exports.DamPatternStrip({ pattern, schedule });
  return nodes;
}

test('iOS generation pattern shows posted upcoming hours on the first render, including schedule-only and zero days', () => {
  const now = Date.parse('2026-10-28T18:00:00Z');
  for (const pattern of [[], [day('2026-10-28', '2026-10-28T05:00:00Z', 24)]]) {
    for (const megawatts of [0, 100]) {
      const posted = ['2026-10-28', '2026-10-29'].map(date => ({ ...schedule(date), hours: schedule(date).hours.map(hour => ({ ...hour, megawatts })) }));
      const expected = patternRows(pattern, posted, undefined, undefined, now);
      for (const fontScale of [1, 1.5]) {
        const nodes = renderNativePattern(pattern, posted, fontScale);
        for (const row of expected) {
          const summary = generation.patternRowVoiceOver(row);
          assert.ok(nodes.some(node => node.props.accessibilityLabel === summary || node.props.children === summary), `${row.dayKey} is visible immediately at text scale ${fontScale}`);
        }
        assert.ok(nodes.some(node => node.props.children === 'Generation pattern'));
        assert.equal(nodes.filter(node => node.type === 'Pressable').length, 0, 'there is no include/hide schedule button');
      }
    }
  }
});

test('iOS generation pattern retains missing observations without inventing a schedule', () => {
  const observed = day('2026-10-27', '2026-10-27T05:00:00Z', 24);
  observed.turbineCfs[2] = null;
  const [expected] = patternRows([observed], [], undefined, undefined, Date.parse('2026-10-28T18:00:00Z'));
  const nodes = renderNativePattern([observed], []);
  assert.ok(nodes.some(node => node.props.accessibilityLabel === generation.patternRowVoiceOver(expected)));
  assert.ok(!nodes.some(node => node.props.children === 'Scheduled'));
  assert.equal(renderNativePattern([], []).length, 0);
});
