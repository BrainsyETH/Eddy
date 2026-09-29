import assert from 'node:assert/strict';
import test from 'node:test';
import {
  demandNight,
  demandNightLabel,
  demandRows,
  bandLevel,
} from '../../../eddy-ios/src/lib/campingDemand';
import { crowdSignalEnabled } from '../../../eddy-ios/src/lib/campingFeature';
import { buildCampingOverview, type ObservationRow } from './camping/overview';

// Tuesday noon, Chicago. The weekend window is Fri Oct 2 – Sun Oct 4.
const now = new Date('2026-09-29T17:00:00Z');

function obs(facility: string, date: string, open: number, reservable = 50): ObservationRow {
  return {
    facility_id: facility,
    date,
    sites_open: open,
    sites_reservable: reservable,
    status: open ? 'open' : 'full',
    fetched_at: '2026-09-29T14:00:00Z',
  };
}
function overview() {
  const facility = (id: string, source: 'recreation_gov' | 'mo_state_parks', service: string) => ({
    id,
    display_name: id,
    source,
    source_facility_id: id,
    source_loop: null,
    enabled: true,
    kind: 'campground',
    access_point_id: null,
    nearby_service_id: service,
    nps_campground_id: null,
    latest: [],
  });
  const service = (id: string) => ({ id, name: id, type: 'campground', latitude: 37, longitude: -91 });
  return buildCampingOverview(
    {
      facilities: [
        facility('akers', 'recreation_gov', 's-akers'),
        facility('pulltite', 'recreation_gov', 's-pulltite'),
        facility('steel', 'recreation_gov', 's-steel'),
        facility('meramec-sp', 'mo_state_parks', 's-meramec'),
      ],
      observations: [
        obs('akers', '2026-10-03', 10),
        obs('pulltite', '2026-10-03', 5),
        obs('steel', '2026-10-03', 45),
        obs('meramec-sp', '2026-10-03', 0),
      ],
      services: ['akers', 'pulltite', 'steel', 'meramec'].map((n) => service('s-' + n)),
      nps: [],
      access: [],
      identities: [],
      serviceRivers: [
        { service_id: 's-akers', river_id: 'r-current', is_primary: true },
        { service_id: 's-pulltite', river_id: 'r-current', is_primary: true },
        { service_id: 's-steel', river_id: 'r-buffalo', is_primary: true },
        { service_id: 's-meramec', river_id: 'r-meramec', is_primary: true },
      ],
      rivers: [
        { id: 'r-current', slug: 'current', name: 'Current River' },
        { id: 'r-buffalo', slug: 'buffalo', name: 'Buffalo River' },
        { id: 'r-meramec', slug: 'meramec', name: 'Meramec River' },
      ],
    },
    now,
    21,
  );
}

test('headline night is the weekend Saturday', () => {
  const o = overview();
  assert.equal(demandNight(o), '2026-10-03');
  assert.equal(demandNightLabel('2026-10-03'), 'Sat night');
});

test('rows aggregate every tracked campground, saved rivers first, state parks excluded', () => {
  const view = demandRows(overview(), new Set(['buffalo']), now.getTime())!;
  assert.deepEqual(view.rows.map((r) => r.slug), ['buffalo', 'current']);
  assert.equal(view.rows[0].name, 'Buffalo River');
  const current = view.rows[1].headline;
  // (40 + 45) booked of 100 reservable.
  assert.equal(current.booked, 0.85);
  assert.equal(current.band, 'crowded');
  assert.equal(current.campgroundsCounted, 2);
  assert.equal(view.rows[0].headline.band, 'quiet');
  assert.equal(view.rows[1].strip.length, 7);
});

test('band levels order the scale and withheld has none', () => {
  assert.equal(bandLevel('quiet'), 0);
  assert.equal(bandLevel('packed'), 4);
  assert.equal(bandLevel(null), null);
});

test('crowd signal flag fails closed', () => {
  for (const f of [undefined, null, {}, { crowdSignal: 'true' }, { crowdSignal: 1 }])
    assert.equal(crowdSignalEnabled(f), false);
  assert.equal(crowdSignalEnabled({ crowdSignal: true }), true);
});

test('a selected strip night drives every river headline; an unknown night falls back to the weekend', () => {
  const o = overview();
  const picked = demandRows(o, new Set(), now.getTime(), '2026-09-30')!;
  assert.equal(picked.night, '2026-09-30');
  assert.equal(picked.nights.length, 7);
  assert.ok(picked.rows.every((r) => r.headline.date === '2026-09-30'));
  // No observations that night: withheld, not Quiet.
  assert.equal(picked.rows[0].headline.band, null);
  const stale = demandRows(o, new Set(), now.getTime(), '2026-12-25')!;
  assert.equal(stale.night, '2026-10-03');
});
