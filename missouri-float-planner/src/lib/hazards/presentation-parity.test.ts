import assert from 'node:assert/strict';
import test from 'node:test';
import * as shared from '../../../../packages/eddy-hazards/index';
import * as web from './presentation';
import type { Hazard } from '@/types/api';

/**
 * The website's hazard list and the app's must agree on order and wording:
 * the order is a safety claim. presentation.ts is a copy of the package (the
 * web build cannot import packages/), and this runs both over the same input.
 */
function hazard(id: string, severity: Hazard['severity'], riverMile: number, extra: Partial<Hazard> = {}): Hazard {
  return {
    id, riverId: 'r', name: id, type: 'other', riverMile, description: null, severity,
    portageRequired: null, portageSide: null, seasonalNotes: null, coordinates: { lng: 0, lat: 0 }, ...extra,
  };
}

const HAZARDS: Hazard[] = [
  hazard('shoal', 'info', 2, { type: 'shoal' }),
  hazard('dam', 'danger', 9, { type: 'low_water_dam', portageRequired: true, portageSide: 'left' }),
  hazard('strainer', 'warning', 4, { type: 'strainer' }),
  hazard('rapid', 'caution', 1, { type: 'rapid', portageRequired: true, portageSide: 'either' }),
  hazard('bridge', 'danger', 3, { type: 'bridge_piling', portageRequired: true }),
  hazard('fence', 'info', 7, { type: 'private_property' }),
];

test('web hazard ordering and labels match the shared package', () => {
  const ids = (list: Hazard[]) => list.map((h) => h.id);
  assert.deepEqual(ids(web.sortHazards(HAZARDS)), ids(shared.sortHazards(HAZARDS as never)));
  assert.deepEqual(ids(web.criticalHazards(HAZARDS)), ids(shared.criticalHazards(HAZARDS as never)));
  assert.equal(web.hazardSummary(HAZARDS), shared.hazardSummary(HAZARDS as never));
  for (const h of HAZARDS) {
    assert.equal(web.hazardTypeLabel(h.type), shared.hazardTypeLabel(h.type));
    assert.equal(web.severityLabel(h.severity), shared.severityLabel(h.severity));
    assert.equal(web.hazardConditionCode(h.severity), shared.hazardConditionCode(h.severity));
    assert.equal(web.portageNote(h), shared.portageNote(h as never));
  }
});
