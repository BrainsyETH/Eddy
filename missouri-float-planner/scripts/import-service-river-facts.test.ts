import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseRoutes } from './import-service-river-facts';
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
