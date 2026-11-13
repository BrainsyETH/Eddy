import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadLinkedServices, withLinkedServices } from './linked-services';
import { reviewedPhotos } from '../photos/reviewed';

// Covers the merge rule in linked-services.ts. The read itself is a query;
// this is the part that decides what a sheet ends up rendering, and it is the
// thing that closes ADR 0008's open trade — absorption carries marks and never
// content, so the content has to arrive by a verified link instead.

test('a linked row joins the list the sheet already draws', () => {
  const merged = withLinkedServices(
    [{ name: 'Akers Ferry Canoe Rental', type: 'outfitter', phone: '573-858-3224' }],
    [
      {
        id: 'svc-1',
        name: 'Alley Spring Campground',
        type: 'campground',
        phone: '573-226-3945',
        website: 'https://www.nps.gov/ozar',
        reservationUrl: null,
        description: null,
        relationship: 'located_at',
      },
    ],
  );
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0], {
    name: 'Alley Spring Campground',
    type: 'campground',
    phone: '573-226-3945',
    website: 'https://www.nps.gov/ozar',
    relationship: 'located_at',
  });
  // And the hand-curated entry it did not collide with survives untouched.
  assert.equal(merged[1].name, 'Akers Ferry Canoe Rental');
});

test('the canonical row replaces the embedded copy of the same place', () => {
  // Measured by db:check-services across all 27 matched entries: 27 strict
  // subsets, 0 contradictions. Every embedded copy knows strictly less, so
  // replacing one loses nothing.
  const merged = withLinkedServices(
    [{ name: 'alley  spring campground', type: 'campground' }],
    [
      {
        id: 'svc-1',
        name: 'Alley Spring Campground',
        type: 'campground',
        phone: '573-226-3945',
        website: null,
        reservationUrl: null,
        description: null,
        relationship: 'same_place',
      },
    ],
  );
  assert.equal(merged.length, 1, 'case and spacing must not make two entries');
  assert.equal(merged[0].phone, '573-226-3945', 'the richer row wins');
  assert.equal(merged[0].relationship, 'same_place');
});

test('the directory vocabulary is translated, never passed through', () => {
  // `nearby_services.type` is the Postgres enum and `NearbyService.type` is the
  // embedded JSONB's, which spells the third one `lodging`. An entry typed
  // `cabin_lodge` reaches serviceTiers through the embedded vocabulary and
  // falls to the kind floor under a name it does not know.
  const typeOf = (directoryType: string) =>
    withLinkedServices(
      [],
      [
        {
          id: 'svc',
          name: 'Somewhere',
          type: directoryType,
          phone: null,
          website: null,
          reservationUrl: null,
          description: null,
          relationship: 'same_place',
        },
      ],
    )[0].type;

  assert.equal(typeOf('cabin_lodge'), 'lodging');
  assert.equal(typeOf('campground'), 'campground');
  assert.equal(typeOf('outfitter'), 'outfitter');
  // Visible under a broad heading beats invisible — the same fallback the tier
  // classifier takes, for the same reason.
  assert.equal(typeOf('something_new'), 'outfitter');
});

test('a place with no links renders exactly what it always did', () => {
  const embedded = [{ name: 'Two Rivers Canoe', type: 'outfitter' }];
  assert.deepEqual(withLinkedServices(embedded, []), embedded);
});

test('absent optional fields stay absent rather than arriving null', () => {
  // The embedded shape marks phone and website optional, and a `phone: null`
  // renders as an empty row rather than as no row.
  const merged = withLinkedServices(
    [],
    [
      {
        id: 'svc',
        name: 'Bare Row',
        type: 'campground',
        phone: null,
        website: null,
        reservationUrl: null,
        description: null,
        relationship: 'same_place',
      },
    ],
  );
  assert.deepEqual(Object.keys(merged[0]).sort(), ['name', 'relationship', 'type']);
});

test('linked service photos reach the embedded listing without borrowing another service photo', async () => {
  const reviewed = reviewedPhotos.find(photo => photo.table === 'nearby_services')!;
  const base = { type: 'campground', phone: null, website: null, reservation_url: null, description: null, status: 'open' };
  const rows = [
    { relationship: 'located_at', nearby_services: { ...base, id: 'photo', name: 'Photo Camp', details: JSON.stringify({ images: [
      { url: 'https://example.com/map.jpg', title: 'Campground map' },
      { url: 'https://example.com/site.jpg', title: 'Site #14' },
      { url: 'http://example.com/unsafe.jpg' },
      { url: 'https://example.com/camp.jpg', title: 'Campground' },
    ] }) } },
    { relationship: 'same_place', nearby_services: { ...base, id: 'bare', name: 'Bare Camp', details: null } },
    { relationship: 'same_place', nearby_services: { ...base, id: reviewed.id, name: reviewed.name, details: {} } },
  ];
  const query = {
    select(columns: string) { assert.match(columns, /\bdetails\b/); return query; },
    eq(column: string, value: string) { assert.equal(column, 'access_point_id'); assert.equal(value, 'access'); return query; },
    async in(column: string, values: string[]) {
      assert.equal(column, 'relationship');
      assert.deepEqual(values, ['same_place', 'located_at']);
      return { data: rows, error: null };
    },
  };
  const client = { from(table: string) { assert.equal(table, 'access_point_services'); return query; } } as unknown as SupabaseClient;
  const linked = await loadLinkedServices(client, 'access');
  const embedded = [{ name: 'Legacy Camp', type: 'campground', imageUrl: 'https://example.com/legacy.jpg' }];
  const merged = withLinkedServices(embedded, linked);
  assert.equal(merged[0].imageUrl, 'https://example.com/camp.jpg');
  assert.equal(merged[1].imageUrl, undefined);
  assert.equal(merged[2].imageUrl, reviewed.image.url);
  assert.equal(merged[3].imageUrl, embedded[0].imageUrl);
});
