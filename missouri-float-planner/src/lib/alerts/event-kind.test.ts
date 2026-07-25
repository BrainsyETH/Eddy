import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EVENT_KINDS,
  classifyEventKind,
  isPushableKind,
  kindRequiresEntitlement,
  type EventKind,
} from './event-kind';
import { computeCondition } from '../conditions';

const CODES = ['dangerous', 'high', 'flowing', 'good', 'low', 'too_low', 'unknown'] as const;

test('every pair in the vocabulary yields a valid kind', () => {
  // Totality matters: the outbox must never silently drop a transition, and
  // the value must satisfy the river_condition_events.kind CHECK.
  for (const oldCode of CODES) {
    for (const newCode of CODES) {
      const kind = classifyEventKind(oldCode, newCode);
      assert.ok(
        (EVENT_KINDS as readonly string[]).includes(kind),
        `${oldCode}→${newCode} produced "${kind}", which is not in the CHECK set`
      );
    }
  }
});

test('escalation into elevated water is a warning', () => {
  for (const from of ['too_low', 'low', 'good', 'flowing'] as const) {
    assert.equal(classifyEventKind(from, 'high'), 'warning', `${from}→high`);
    assert.equal(classifyEventKind(from, 'dangerous'), 'warning', `${from}→dangerous`);
  }
  assert.equal(classifyEventKind('high', 'dangerous'), 'warning', 'deeper escalation');
});

test('dangerous to high is easing, not recovery', () => {
  assert.equal(classifyEventKind('dangerous', 'high'), 'easing');
});

test('dropping out of elevated water is recovery', () => {
  for (const to of ['flowing', 'good', 'low', 'too_low'] as const) {
    assert.equal(classifyEventKind('high', to), 'recovery', `high→${to}`);
    assert.equal(classifyEventKind('dangerous', to), 'recovery', `dangerous→${to}`);
  }
});

test('too low becoming floatable is the funnel moment', () => {
  // The transition the iOS "notify me when it's floatable" flow is named for,
  // and the one the social classifier drops entirely.
  assert.equal(classifyEventKind('low', 'good'), 'floatable');
  assert.equal(classifyEventKind('low', 'flowing'), 'floatable');
  assert.equal(classifyEventKind('too_low', 'good'), 'floatable');
  assert.equal(classifyEventKind('too_low', 'flowing'), 'floatable');
});

test('unknown on either side is info, never a push', () => {
  for (const code of CODES) {
    assert.equal(classifyEventKind('unknown', code), 'info', `unknown→${code}`);
    assert.equal(classifyEventKind(code, 'unknown'), 'info', `${code}→unknown`);
  }
});

test('minor moves within floatable or below are info', () => {
  assert.equal(classifyEventKind('good', 'flowing'), 'info');
  assert.equal(classifyEventKind('flowing', 'good'), 'info');
  assert.equal(classifyEventKind('low', 'too_low'), 'info');
  assert.equal(classifyEventKind('too_low', 'low'), 'info');
  assert.equal(classifyEventKind('good', 'low'), 'info', 'dropping below floatable is not news');
});

test('a non-transition is info', () => {
  for (const code of CODES) {
    assert.equal(classifyEventKind(code, code), 'info');
  }
});

// ── push policy ──────────────────────────────────────────────────

test('only floatable, warning and easing are pushable', () => {
  assert.equal(isPushableKind('floatable'), true);
  assert.equal(isPushableKind('warning'), true);
  assert.equal(isPushableKind('easing'), true);
  assert.equal(isPushableKind('recovery'), false, 'all-clear is feed-only');
  assert.equal(isPushableKind('info'), false);
});

test('safety warnings are free; the floatability translation is paid', () => {
  // Hazard warnings must never sit behind the paywall — condition display is
  // always free, including dangerous.
  assert.equal(kindRequiresEntitlement('warning'), false);
  assert.equal(kindRequiresEntitlement('floatable'), true);
  assert.equal(kindRequiresEntitlement('easing'), true);
});

// ── the guard that keeps social behavior unchanged ───────────────

test('recovery and floatable exist in the outbox but are absent from social', () => {
  // The outbox records these; the social classifier deliberately does not post
  // them. If a future refactor merges the two classifiers, this documents why
  // that would resurrect the removed all-clear posts.
  const outboxRecords = ['recovery', 'floatable'] satisfies EventKind[];
  for (const kind of outboxRecords) {
    assert.ok((EVENT_KINDS as readonly string[]).includes(kind));
  }
  assert.equal(classifyEventKind('high', 'good'), 'recovery');
  assert.equal(classifyEventKind('low', 'good'), 'floatable');
});

// ── the vocabulary matches what computeCondition can emit ────────

test('classification covers every code computeCondition can produce', () => {
  const emitted = new Set<string>();
  const th = {
    levelTooLow: 1, levelLow: 2, levelOptimalMin: 3, levelOptimalMax: 4,
    levelHigh: 4, levelDangerous: 8, thresholdUnit: 'ft' as const,
  };
  for (const v of [null, 0.5, 1.5, 2.5, 3.5, 5, 9]) {
    emitted.add(computeCondition(v, th).code);
  }
  for (const code of emitted) {
    assert.ok(CODES.includes(code as (typeof CODES)[number]), `${code} missing from test vocabulary`);
  }
});
