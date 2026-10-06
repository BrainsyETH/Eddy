import assert from 'node:assert/strict';
import test from 'node:test';
import type { RiverAlert } from '@/types/api';
import {
  assessRecommendation,
  type RecommendationInput,
} from './recommendation';

const base: RecommendationInput = {
  usable: true,
  hasDuration: true,
  conditionCode: 'good',
  lowSpanGauge: false,
  future: false,
  forecastComplete: true,
  forecastUnsuitable: false,
  hazards: [],
  unlocatedHazards: [],
  alerts: { checkedAllApplicable: true, alerts: [], sources: [] },
  riverName: 'Current River',
  endpointNames: ['Akers Ferry', 'Pulltite'],
};
const notice = (
  title: string,
  patch: Partial<RiverAlert> = {},
): RiverAlert => ({
  id: 'notice-1',
  source: 'nps',
  category: 'Closure',
  severity: 'watch',
  title,
  body: '',
  riverSlug: 'current',
  riverName: 'Current River',
  startsAt: null,
  endsAt: null,
  url: 'https://www.nps.gov/ozar/',
  ...patch,
});
const withAlert = (alert: RiverAlert) =>
  assessRecommendation({
    ...base,
    alerts: { ...base.alerts, alerts: [alert] },
  });

test('alert categories and county matching alone only make an option conditional', () => {
  for (const alert of [
    notice('Campground closed'),
    notice('Trail closure near Current River'),
    notice('Flood Warning for Shannon County', {
      source: 'nws',
      category: 'Flood Warning',
      severity: 'warning',
    }),
    notice('Current River is closed between Van Buren and Doniphan'),
    notice('Current River may close if flooding continues'),
    notice('Current River is not closed'),
    notice('Akers Ferry campground is closed'),
  ]) {
    const result = withAlert(alert);
    assert.equal(result.recommendationStatus, 'conditional', alert.title);
    assert.equal(result.blockingReasons.length, 0);
    assert.equal(result.cautionReasons[0].sourceId, alert.id);
  }
});

test('explicit closure of the river, an endpoint or the entire park blocks', () => {
  for (const title of [
    'Current River is closed to boating',
    'Akers Ferry access is closed',
    'Pulltite is closed',
    'The entire park is closed',
  ]) {
    const result = withAlert(notice(title));
    assert.equal(result.recommendationStatus, 'not_recommended', title);
    assert.equal(result.blockingReasons[0].code, 'official_closure');
  }
});

test('lookup failures and missing matching configuration explain conditional results', () => {
  for (const source of [
    { source: 'NWS', status: 'lookup_failed' },
    {
      source: 'NWS',
      status: 'unavailable',
      reason: 'River alert matching is not configured.',
      reasonCode: 'matching_unconfigured',
    },
    { source: 'NPS', status: 'lookup_failed' },
  ]) {
    const result = assessRecommendation({
      ...base,
      alerts: {
        ...base.alerts,
        checkedAllApplicable: false,
        sources: [source],
      },
    });
    assert.equal(result.recommendationStatus, 'conditional');
    assert.equal(result.cautionReasons[0].code, 'alert_source_incomplete');
    assert.match(result.cautionReasons[0].message, new RegExp(source.source));
  }
});

test('danger records use the database vocabulary and cannot disappear without a portage flag', () => {
  const danger = {
    id: 'dam',
    name: 'Dam',
    severity: 'danger',
    portage_required: false,
  };
  assert.equal(
    assessRecommendation({ ...base, hazards: [danger] }).blockingReasons[0]
      .code,
    'danger_on_route',
  );
  assert.equal(
    assessRecommendation({ ...base, unlocatedHazards: [danger] })
      .blockingReasons[0].code,
    'danger_location_unknown',
  );
  const caution = { ...danger, severity: 'caution' };
  assert.equal(
    assessRecommendation({ ...base, unlocatedHazards: [caution] })
      .recommendationStatus,
    'conditional',
  );
});

test('required portage is a caution with recorded side and description', () => {
  const result = assessRecommendation({
    ...base,
    hazards: [
      {
        id: 'dam',
        name: 'Dam',
        severity: 'warning',
        portage_required: true,
        portage_side: 'left',
        description: 'Carry around the obstruction.',
      },
    ],
  });
  assert.equal(result.recommendationStatus, 'conditional');
  assert.equal(result.cautionReasons[0].code, 'portage_required');
  assert.match(result.cautionReasons[0].message, /left.*Carry around/);
  assert.equal(result.blockingReasons.length, 0);
});

test('water, duration and forecast blockers remain independent of conditional source checks', () => {
  for (const patch of [
    { usable: false },
    { hasDuration: false },
    { conditionCode: 'dangerous' },
    { lowSpanGauge: true },
    { future: true, forecastUnsuitable: true },
  ]) {
    const result = assessRecommendation({
      ...base,
      ...patch,
      alerts: {
        ...base.alerts,
        checkedAllApplicable: false,
        sources: [{ source: 'NPS', status: 'lookup_failed' }],
      },
    });
    assert.equal(result.recommendationStatus, 'not_recommended');
    assert.ok(result.blockingReasons.length);
    assert.ok(result.cautionReasons.length);
  }
  assert.equal(
    assessRecommendation({ ...base, future: true, forecastComplete: false })
      .recommendationStatus,
    'conditional',
  );
  assert.equal(assessRecommendation(base).recommendationStatus, 'candidate');
});

test('informational park notices do not change status; warnings embedded in them still require caution', () => {
  const info = notice('Visitor center hours', {
    category: 'Information',
    severity: 'notice',
    body: 'Open weekdays.',
  });
  const out = withAlert(info);
  assert.equal(out.recommendationStatus, 'candidate');
  assert.equal(out.notices[0].sourceId, info.id);
  const unrelated = withAlert(
    notice('Trail closure', {
      body: 'This closure does not affect river access.',
    }),
  );
  assert.equal(unrelated.recommendationStatus, 'candidate');
  assert.equal(unrelated.notices.length, 1);
  assert.equal(
    withAlert({ ...info, body: 'Flood warning remains in effect.' })
      .recommendationStatus,
    'conditional',
  );
  const danger = assessRecommendation({
    ...base,
    hazards: [
      { id: 'dam', name: 'Dam', severity: 'danger', portage_required: true },
    ],
  });
  assert.equal(danger.recommendationStatus, 'not_recommended');
  assert.equal(danger.cautionReasons[0].code, 'portage_required');
});
