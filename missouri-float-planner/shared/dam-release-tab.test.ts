import test from 'node:test';
import assert from 'node:assert/strict';
import { damReleaseTab } from './dam-release-tab';

test("the White's own release tab leads with Bull Shoals and takes its Read", () => {
  assert.deepEqual(
    damReleaseTab({ siteId: 'swl-bull-shoals-dam', provider: 'usace', rated: false, heldDamId: 'swl-bull-shoals-dam' }),
    { damId: 'swl-bull-shoals-dam', leadsCard: true },
  );
});

test("the White's Norfork release tab takes Norfork Dam's Read, not Bull Shoals'", () => {
  // The page holds Bull Shoals' snapshot only, so the card cannot lead with
  // Norfork without another request — but the Read belongs to the tab's dam.
  assert.deepEqual(
    damReleaseTab({ siteId: 'swl-norfork-dam', provider: 'usace', rated: false, heldDamId: 'swl-bull-shoals-dam' }),
    { damId: 'swl-norfork-dam', leadsCard: false },
  );
});

test('a downstream USGS tab is never a dam release', () => {
  // Calico Rock is 61 miles below Bull Shoals; the dam Read's times are at the dam.
  assert.equal(damReleaseTab({ siteId: '07060500', provider: 'usgs', rated: false, heldDamId: 'swl-bull-shoals-dam' }), null);
  // The legacy contract leaves provider off for USGS.
  assert.equal(damReleaseTab({ siteId: '07060500', provider: undefined, rated: false, heldDamId: 'swl-bull-shoals-dam' }), null);
});

test('a rated release keeps its verdict and its river Read', () => {
  // Clearwater's release on the Black has a ladder in cfs.
  assert.equal(damReleaseTab({ siteId: 'swl-clearwater-dam', provider: 'usace', rated: true, heldDamId: 'swl-clearwater-dam' }), null);
});

test('no gauge, no tab', () => {
  assert.equal(damReleaseTab({ siteId: null, provider: 'usace', rated: false, heldDamId: null }), null);
});
