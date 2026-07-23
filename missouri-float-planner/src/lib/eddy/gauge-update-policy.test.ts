import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canRegenerateGaugeReport,
  confirmsGaugeConditionChange,
  isGaugeReportCompatible,
  MAX_GAUGE_REPORTS_PER_WINDOW,
} from './gauge-update-policy';

const now = new Date('2026-07-22T18:00:00Z');

test('keeps generated prose across labels in the same floatable class', () => {
  assert.equal(isGaugeReportCompatible({
    storedCondition: 'flowing',
    liveCondition: 'good',
    readingTimestamp: '2026-07-22T17:00:00Z',
    now,
  }), true);
});

test('requires two matching observations before an elevated regeneration', () => {
  assert.equal(confirmsGaugeConditionChange({
    storedCondition: 'flowing', liveCondition: 'high', previousCondition: 'flowing',
  }), false);
  assert.equal(confirmsGaugeConditionChange({
    storedCondition: 'flowing', liveCondition: 'high', previousCondition: 'high',
  }), true);
  assert.equal(confirmsGaugeConditionChange({
    storedCondition: 'high', liveCondition: 'flowing', previousCondition: null,
  }), true);
});

test('rejects prose after a material safety-class change or stale reading', () => {
  assert.equal(isGaugeReportCompatible({
    storedCondition: 'flowing',
    liveCondition: 'high',
    readingTimestamp: '2026-07-22T17:00:00Z',
    now,
  }), false);
  assert.equal(isGaugeReportCompatible({
    storedCondition: 'flowing',
    liveCondition: 'flowing',
    readingTimestamp: '2026-07-21T16:00:00Z',
    now,
  }), false);
});

test('applies the two-hour cooldown and four-report rolling ceiling', () => {
  assert.equal(canRegenerateGaugeReport({
    latestGeneratedAt: '2026-07-22T17:00:00Z', reportsInRollingWindow: 1, now,
  }), false);
  assert.equal(canRegenerateGaugeReport({
    latestGeneratedAt: '2026-07-22T15:00:00Z', reportsInRollingWindow: 1, now,
  }), true);
  assert.equal(canRegenerateGaugeReport({
    latestGeneratedAt: '2026-07-22T15:00:00Z', reportsInRollingWindow: MAX_GAUGE_REPORTS_PER_WINDOW, now,
  }), false);
});
