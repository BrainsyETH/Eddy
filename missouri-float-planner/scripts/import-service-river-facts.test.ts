import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseRoutes, parseMiles } from './import-service-river-facts';
import { parseCsv } from './import-services-csv';

// services_offered belongs to the business; service_rivers only recorded
// membership. Between them they asserted that every rental a business lists
// applies on every river it touches, which is false for the Courtois.

test('a route keeps its put-in and take-out', () => {
  const { routes, errors } = parseRoutes("Berryman to Bass',13,Berryman Campground,Bass' River Resort");
  assert.deepEqual(errors, []);
  assert.deepEqual(routes, [{
    name: "Berryman to Bass'", miles: 13,
    putIn: 'Berryman Campground', takeOut: "Bass' River Resort", seasonal: false,
  }]);
});

test('a distance range keeps its lower bound', () => {
  // A 20-25 mile trip is at least 20, and somebody deciding whether they have
  // the day for it wants the floor, not the optimistic end.
  const { routes } = parseRoutes('Multi-day,20-25,Berryman Campground,');
  assert.equal(routes[0].miles, 20);
});

test('seasonality is per route, which is the point', () => {
  const { routes, errors } = parseRoutes('Butts Slab,10,Courtois,Meramec|Courtois Primitive,5,Courtois,Meramec,seasonal');
  assert.deepEqual(errors, []);
  assert.equal(routes[0].seasonal, false);
  assert.equal(routes[1].seasonal, true, 'Ozark Outdoors runs this one seasonally on the Courtois only');
});

test('a route with no distance is allowed; one with a bad distance is not', () => {
  assert.deepEqual(parseRoutes('Unmeasured,,,').errors, []);
  assert.equal(parseRoutes('Unmeasured,,,').routes[0].miles, null);
  assert.ok(parseRoutes('Bad,ten miles,,').errors.some((e) => /not a number/.test(e)));
});

test('a nameless or fragmentary route is refused', () => {
  assert.ok(parseRoutes('OnlyAName').errors.some((e) => /at least a name and a distance/.test(e)));
  assert.ok(parseRoutes(',5,,').errors.some((e) => /has no name/.test(e)));
});

test('the fifth field must say seasonal or year-round, not anything', () => {
  assert.ok(parseRoutes('X,5,,,summer').errors.some((e) => /must be seasonal or year-round/.test(e)));
  assert.deepEqual(parseRoutes('X,5,,,year-round').errors, []);
});

test('the committed facts file parses and names only real columns', () => {
  const file = path.join(__dirname, 'ingestion', 'service-river-facts.csv');
  const matrix = parseCsv(fs.readFileSync(file, 'utf-8'));
  const headers = matrix[0].map((h) => h.trim());
  assert.deepEqual(headers, [
    'service_slug', 'river_slug', 'services_offered', 'routes',
    'seasonal_notes', 'verified_source', 'source_checked_at',
  ]);

  const routesAt = headers.indexOf('routes');
  let parsed = 0;
  for (const row of matrix.slice(1)) {
    if (row.length === 1 && row[0].trim() === '') continue;
    const { routes, errors } = parseRoutes(row[routesAt] ?? '');
    assert.deepEqual(errors, [], `${row[0]} ↔ ${row[1]}: ${errors.join('; ')}`);
    parsed += routes.length;
  }
  assert.ok(parsed >= 15, `expected the committed routes to parse, got ${parsed}`);
});

// ── Route distances ───────────────────────────────────────────────────────
// split('-')[0] got three cases wrong and every one of them silently. A route
// that ships a wrong length is worse than one that ships none: somebody plans
// their day around it.

test('a negative distance is refused, not read as no distance', () => {
  // The original bug: "-5".split("-")[0] is "", which took the same branch as
  // an empty cell, so the route shipped claiming no length at all.
  const bad = parseMiles('-5');
  assert.equal(typeof bad, 'string', `expected an error, got ${JSON.stringify(bad)}`);
  assert.match(bad as string, /not a number/);
});

test('a backwards range is refused rather than silently taking the ceiling', () => {
  const bad = parseMiles('5-3');
  assert.equal(typeof bad, 'string');
  assert.match(bad as string, /backwards range/);
});

test('a real range keeps its lower bound', () => {
  assert.equal(parseMiles('20-25'), 20);
  assert.equal(parseMiles('20 - 25'), 20);
  assert.equal(parseMiles('7.5-9'), 7.5);
});

test('zero is not a float', () => {
  const bad = parseMiles('0');
  assert.equal(typeof bad, 'string');
  assert.match(bad as string, /a float has length/);
});

test('an absurd distance is a typo, not a route', () => {
  const bad = parseMiles('1e5');
  assert.equal(typeof bad, 'string', 'exponent notation must not slip through as finite');
  const big = parseMiles('4172843290');
  assert.equal(typeof big, 'string', 'a phone number in the miles column');
  assert.match(big as string, /sanity limit/);
});

test('an absent distance is still allowed', () => {
  assert.equal(parseMiles(''), null);
  assert.equal(parseMiles('   '), null);
});

test('an ordinary distance passes', () => {
  assert.equal(parseMiles('7'), 7);
  assert.equal(parseMiles('12.5'), 12.5);
  assert.equal(parseMiles(' 3 '), 3);
});

test('a bad distance fails the whole route, naming it', () => {
  const { routes, errors } = parseRoutes('Hammond to Blair,-5,Hammond Mill,Blair Bridge');
  assert.deepEqual(routes, [], 'nothing ships from a route that failed');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Hammond to Blair/);
});
