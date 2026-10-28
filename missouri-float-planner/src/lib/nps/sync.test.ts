import assert from 'node:assert/strict';
import test from 'node:test';
import type { NPSPlaceRaw } from '@/types/nps';
import { placeColumns } from './sync';

// A place whose prose mentions a spring, so categorizePOI guesses `spring`:
// the same shape as Granny Henderson's Cabin and Devils Well, both of which
// the weekly sync kept retyping after they were reviewed.
const place = {
  id: 'nps-1',
  title: 'Devils Well',
  listingDescription: 'Devils Well',
  bodyText: 'A trail leads from the sinkhole to Cave Spring.',
  url: 'https://www.nps.gov/places/devils-well.htm',
  latitude: '37.3',
  longitude: '-91.5',
  images: [],
  amenities: [],
  tags: [],
} as unknown as NPSPlaceRaw;

const SYNCED_AT = '2026-11-01T08:00:00.000Z';

test('a refresh never rewrites what Eddy reviewed about a place', () => {
  const columns = placeColumns(place, { isNew: false, syncedAt: SYNCED_AT });
  for (const owned of ['type', 'active', 'is_on_water']) {
    assert.equal(owned in columns, false, `a refresh must not write ${owned}`);
  }
  // NPS content still refreshes.
  assert.equal(columns.name, 'Devils Well');
  assert.equal(columns.body_text, place.bodyText);
  assert.equal(columns.last_synced_at, SYNCED_AT);
  assert.equal(columns.latitude, 37.3);
});

test('a new place gets a first-guess classification and visibility', () => {
  const columns = placeColumns(place, { isNew: true, syncedAt: SYNCED_AT });
  assert.equal(columns.type, 'spring');
  assert.equal(columns.active, true);
  assert.equal(columns.is_on_water, true);
  assert.equal(columns.nps_id, 'nps-1');
});
