import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveRiverMetadataFindings, type CanonicalRiverMetadataRow } from './river-metadata';

const complete: CanonicalRiverMetadataRow = {
  slug: 'current', weather_city: 'Van Buren', weather_lat: 36.99, weather_lon: -91.01,
  alert_search_terms: ['current river'],
  river_characteristics: [{ rain_lag_hours: 8, rain_lag_note: '6-12 hours', drop_rate_note: 'slow', river_note: 'Spring fed.' }],
};

test('complete canonical metadata passes', () => {
  assert.deepEqual(deriveRiverMetadataFindings([complete]), []);
});

test('each removed value fallback has a corresponding finding', () => {
  const findings = deriveRiverMetadataFindings([{
    ...complete, weather_city: null, alert_search_terms: [],
    river_characteristics: [{ rain_lag_hours: null, rain_lag_note: null, drop_rate_note: null, river_note: null }],
  }]);
  assert.deepEqual(findings.map((finding) => finding.ruleKey), [
    'canonical_weather_missing', 'canonical_alert_terms_missing', 'canonical_rain_lag_missing', 'canonical_river_note_missing',
  ]);
});
