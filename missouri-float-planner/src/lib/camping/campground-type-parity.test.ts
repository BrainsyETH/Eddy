// src/lib/camping/campground-type-parity.test.ts
// Asserts the app's campground type stays a faithful subset of the website's.
//
// Two declarations exist for the reason availability-copy-parity.test.ts gives:
// Vercel installs only missouri-float-planner/, so shippable web code cannot
// import @eddy/types, and the shape has to be written twice. Tests may reach
// across — they run under tsconfig.test.json — so this is the guard.
//
// WHY IT MATTERS MORE THAN IT LOOKS. Both declarations describe the SAME bytes:
// getNPSCampgroundInfo in src/lib/access-points/detail.ts and toNpsCampground
// in src/lib/offline/shapes.ts build one object, and the app's HTTP client does
// no runtime stripping. So the app's type is not a contract with the server —
// it is a decision about how much of what already arrived the app is allowed to
// see. Every field missing here was a field the phone was being sent and
// throwing away, which is exactly how the site counts, fees and hours stayed
// invisible for as long as they did.
//
// A field named differently on the two sides is the failure this catches: it
// type-checks on both, and silently reads undefined on the app.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Top-level property names of an interface, by source text. */
function fieldsOf(source: string, name: string): string[] {
  const start = source.indexOf(`export interface ${name} {`);
  assert.notEqual(start, -1, `interface ${name} not found`);

  let depth = 0;
  let i = source.indexOf('{', start);
  const bodyStart = i + 1;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const body = source.slice(bodyStart, i);

  // Only depth-0 lines are fields; nested object literals (amenities) have
  // their own members and must not be mistaken for top-level ones.
  const fields: string[] = [];
  let nest = 0;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    const opens = (line.match(/{/g) ?? []).length;
    const closes = (line.match(/}/g) ?? []).length;
    if (nest === 0) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)\??\s*:/.exec(line);
      if (match) fields.push(match[1]);
    }
    nest += opens - closes;
  }
  return fields;
}

const appSource = readFileSync(
  join(process.cwd(), '../packages/eddy-types/index.ts'),
  'utf8',
);
const webSource = readFileSync(join(process.cwd(), 'src/types/api.ts'), 'utf8');

const appFields = fieldsOf(appSource, 'NpsCampgroundSummary');
const webFields = fieldsOf(webSource, 'NPSCampgroundInfo');

test('every field the app declares exists on the website type', () => {
  // A name that drifted apart type-checks on both sides and reads undefined on
  // the phone, which is the whole failure mode this file exists for.
  const missing = appFields.filter((field) => !webFields.includes(field));
  assert.deepEqual(missing, [], `app-only fields: ${missing.join(', ')}`);
});

test('the app sees the campground fields a camper decides on', () => {
  // Not "every field": the app deliberately omits npsId and weatherOverview,
  // which nothing on a phone renders. These are the ones a decision rests on,
  // and each was on the wire and undeclared before the sheet needed it.
  for (const field of [
    'fees',
    'totalSites',
    'sitesReservable',
    'sitesFirstCome',
    'sitesTentOnly',
    'sitesRvOnly',
    'sitesElectrical',
    'sitesGroup',
    'sitesWalkBoatTo',
    'amenities',
    'operatingHours',
    'availability',
  ]) {
    assert.ok(appFields.includes(field), `NpsCampgroundSummary is missing ${field}`);
  }
});

test('the amenity keys match, since the app tests each one by name', () => {
  // campAmenities in AccessTabs reads these individually. A rename on the
  // website would leave the app quietly showing a campground no amenities.
  for (const key of [
    'toilets',
    'showers',
    'cellPhoneReception',
    'potableWater',
    'campStore',
    'firewoodForSale',
    'dumpStation',
    'trashCollection',
  ]) {
    assert.ok(
      appSource.includes(`    ${key}:`),
      `amenity ${key} missing from NpsCampgroundSummary`,
    );
    assert.ok(webSource.includes(`    ${key}:`), `amenity ${key} missing from NPSCampgroundInfo`);
  }
});
