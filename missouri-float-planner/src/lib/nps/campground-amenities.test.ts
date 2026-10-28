import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { npsAmenityOffered } from './campground-amenities';

// Values as the NPS API stores them on nps_campgrounds.amenities.

test('a campground with no showers is not offered showers', () => {
  assert.equal(npsAmenityOffered(['None']), false);
  assert.equal(npsAmenityOffered([]), false);
  assert.equal(npsAmenityOffered(undefined), false);
  assert.equal(npsAmenityOffered(['']), false);
});

test('real showers are offered, seasonal or not', () => {
  assert.equal(npsAmenityOffered(['Hot - Year Round', 'Free - Year Round']), true);
  assert.equal(npsAmenityOffered(['Free - Seasonal', 'Hot - Year Round']), true);
  assert.equal(npsAmenityOffered(['Cold - Seasonal']), true);
});

test('every spelling of "not offered" is negative, not just the exact string No', () => {
  assert.equal(npsAmenityOffered(['No water']), false);
  assert.equal(npsAmenityOffered(['No']), false);
  assert.equal(npsAmenityOffered('No'), false);
  assert.equal(npsAmenityOffered(['Not available']), false);
  assert.equal(npsAmenityOffered(['Yes - seasonal']), true);
  assert.equal(npsAmenityOffered('Yes - year round'), true);
});

test('the services directory reads showers from the showers field, and water from water', () => {
  // The defect this file exists for: showers were derived from potableWater.
  const route = readFileSync(
    join(process.cwd(), 'src/app/api/rivers/[slug]/services/route.ts'),
    'utf8',
  );
  assert.match(route, /npsAmenityOffered\(amenitiesObj\.showers\)\) offeredServices\.push\('showers'\)/);
  assert.match(route, /npsAmenityOffered\(amenitiesObj\.potableWater\)\) offeredServices\.push\('potable_water'\)/);
});
