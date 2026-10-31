// src/lib/display/display-model.test.ts
// The wall display must answer the way the app does: the same floatable count,
// the same "best float" rule, and no suggestion it cannot stand behind.

import assert from 'node:assert/strict';
import test from 'node:test';
import type { RiverAlert, RiverListItem } from '@/types/api';
import { buildDisplayModel, formatReading, isBestEligible, parseCoords } from './display-model';

const HERE = { lat: 37.0, lng: -91.0 };

function river(
  slug: string,
  code: 'flowing' | 'good' | 'low' | 'high' | 'dangerous' | 'unknown',
  opts: { age?: number | null; lng?: number; unit?: 'ft' | 'cfs' | null; ft?: number | null; cfs?: number | null; type?: string } = {},
): RiverListItem {
  return {
    id: slug, name: `River ${slug}`, slug, lengthMiles: 10,
    description: null, difficultyRating: null, region: null, accessPointCount: 2,
    floatAccessCoordinates: [{ lat: 37.0, lng: opts.lng ?? -91.1 }],
    state: 'MO', riverType: opts.type ?? 'spring_fed_float', path: `/rivers/missouri/${slug}`,
    currentCondition: {
      label: code, code, thresholdUnit: opts.unit === undefined ? 'ft' : opts.unit,
      gaugeHeightFt: opts.ft === undefined ? 2.5 : opts.ft, dischargeCfs: opts.cfs ?? null,
      readingAgeHours: opts.age === undefined ? 0.5 : opts.age, trend: null,
    },
  };
}

test('the count is the canonical floatable count over every river', () => {
  const model = buildDisplayModel({ rivers: [river('a', 'flowing'), river('b', 'good'), river('c', 'low'), river('d', 'high')] });
  assert.equal(model.floatable, 2);
  assert.equal(model.total, 4);
  assert.equal(model.headline, '2 of 4 rivers are floatable right now');
  assert.equal(model.headlineNote, null);
});

test('dam tailwaters stay out of the count, as they do on the app', () => {
  const model = buildDisplayModel({
    rivers: [river('a', 'flowing'), river('b', 'low'), river('tw', 'unknown', { type: 'dam_tailwater' })],
  });
  assert.equal(model.floatable, 1);
  assert.equal(model.total, 2);
  assert.equal(model.headline, '1 of 2 rivers is floatable right now');
  assert.equal(model.headlineNote, 'Plus 1 dam tailwater, where flow depends on dam releases.');
});

test('best float prefers the better band, then the nearer access', () => {
  const model = buildDisplayModel({
    rivers: [river('near-good', 'good', { lng: -91.05 }), river('far-flowing', 'flowing', { lng: -91.9 }), river('nearer-flowing', 'flowing', { lng: -91.3 })],
    coords: HERE,
  });
  assert.equal(model.best?.river.slug, 'nearer-flowing');
});

test('a stale or missing reading never earns a suggestion', () => {
  const stale = buildDisplayModel({ rivers: [river('a', 'flowing', { age: 9 })] });
  assert.equal(stale.best, null);
  const noValue = buildDisplayModel({ rivers: [river('b', 'flowing', { unit: 'cfs', cfs: null })] });
  assert.equal(noValue.best, null);
  assert.match(noValue.emptyBest, /No river has a fresh floatable reading/);
});

test('high water never becomes the best float, and it raises a notice', () => {
  const model = buildDisplayModel({ rivers: [river('h', 'high'), river('f', 'dangerous')] });
  assert.equal(model.best, null);
  assert.deepEqual(model.notices.map((n) => n.tone), ['caution', 'danger']);
});

test('rivers outside the radius are left off a located display', () => {
  const model = buildDisplayModel({ rivers: [river('near', 'good', { lng: -91.2 }), river('far', 'flowing', { lng: -97 })], coords: HERE });
  assert.deepEqual(model.rivers.map((r) => r.slug), ['near']);
});

test('pinned rivers keep the host order', () => {
  const model = buildDisplayModel({ rivers: [river('a', 'good'), river('b', 'flowing'), river('c', 'low')], pinned: ['c', 'a', 'missing'] });
  assert.deepEqual(model.rivers.map((r) => r.slug), ['c', 'a']);
});

test('the trip comes from favorite floats and keeps the dam withholding', () => {
  const floats = [{ riverSlug: 'tw', putInId: 'p', putInName: 'Dam', takeOutId: 't', takeOutName: 'Bridge', distanceMiles: 6, durationFormatted: null, durationUnavailableReason: 'regulated' }];
  const model = buildDisplayModel({ rivers: [river('tw', 'flowing', { type: 'dam_tailwater' })], floats });
  assert.equal(model.best?.trip?.duration, null);
  assert.match(model.best?.trip?.withheld ?? '', /Dam releases/);
});

test('agency notices only appear for rivers on screen, and never plain notices', () => {
  const alert = (id: string, slug: string, severity: RiverAlert['severity']): RiverAlert => ({
    id, source: 'nws', severity, riverSlug: slug, riverName: slug, title: `Alert ${id}`, body: '', category: '', startsAt: null, endsAt: null, url: null,
  });
  const model = buildDisplayModel({
    rivers: [river('a', 'good')], pinned: ['a'],
    alerts: [alert('1', 'a', 'warning'), alert('2', 'a', 'notice'), alert('3', 'elsewhere', 'warning')],
  });
  assert.deepEqual(model.notices.map((n) => n.key), ['alert:1']);
});

test('reads fall back to the statewide summary', () => {
  const model = buildDisplayModel({ rivers: [river('a', 'good')], statewide: { prose: 'Most rivers are fine.', generatedAt: '' } });
  assert.equal(model.reads[0].text, 'Most rivers are fine.');
});

test('reading shows only the rated unit, and coords must be well formed', () => {
  assert.equal(formatReading(river('a', 'good', { unit: 'cfs', cfs: 756.4 }).currentCondition), '756 cfs');
  assert.equal(formatReading(river('a', 'good', { unit: null }).currentCondition), null);
  assert.equal(isBestEligible({ slug: 'x', name: 'x', code: 'good', label: 'Good', reading: '1 ft', ageHours: 1, stale: false, trend: null, distanceMiles: null, riverType: null }), true);
  assert.deepEqual(parseCoords('37.1', '-91.5'), { lat: 37.1, lng: -91.5 });
  assert.equal(parseCoords('abc', '1'), null);
  assert.equal(parseCoords('95', '1'), null);
});
