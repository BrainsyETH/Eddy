import assert from 'node:assert/strict';
import test from 'node:test';
import { floatNavigation, navigationRiver, siteNavigation } from './site-navigation';
import { readRiverMapSearch, writeRiverMapSearch } from './river-map-search';

test('river pages carry the river into the planner and finder, including access details', () => {
  for (const path of ['/rivers/current', '/rivers/missouri/current', '/rivers/missouri/current/access/akers-ferry']) {
    const links = siteNavigation(path, 'river=meramec', true);
    assert.equal(links.find(link => link.label === 'Map')?.href, '/plan?river=current');
    assert.equal(links.find(link => link.label === 'Floats')?.href, '/find-float?river=current');
    assert.deepEqual(links.filter(link => link.active).map(link => link.label), ['Conditions']);
  }
});

test('directories and unrelated pages never turn a state or old query into a selected river', () => {
  for (const path of ['/', '/rivers', '/rivers/missouri', '/rivers/missouri/access/akers-ferry', '/blog/guide', '/dams', '/about']) {
    assert.equal(navigationRiver(path, 'river=current'), null, path);
  }
  assert.equal(navigationRiver('/plan', 'river=%3Cscript%3E'), null);
});

test('map and planner URL selections propagate, while search discovery respects the release flag', () => {
  assert.deepEqual(siteNavigation('/', '', true).map(link => link.label), ['Map', 'Conditions', 'Floats', 'Guides']);
  assert.deepEqual(siteNavigation('/', '', false).map(link => link.label), ['Map', 'Conditions', 'Guides']);
  assert.deepEqual(floatNavigation('/plan').map(link => link.label), ['Plan a float', 'Find a float']);
  for (const path of ['/river-map', '/find-float', '/plan']) {
    assert.equal(navigationRiver(path, 'river=buffalo'), 'buffalo');
    assert.equal(navigationRiver(path, 'river=meramec'), 'meramec');
    assert.equal(navigationRiver(path), null);
  }
  const disabled = siteNavigation('/rivers/missouri/current', '', false);
  assert.equal(disabled.find(link => link.label === 'Map')?.href, '/plan?river=current');
  assert.equal(disabled.some(link => link.label === 'Floats'), false);
});

test('Map owns the planner, while Conditions and Floats keep distinct active sections', () => {
  for (const path of ['/gauges/07067000', '/dams/swl-bull-shoals-dam', '/rivers/arkansas/buffalo']) {
    assert.deepEqual(siteNavigation(path, '', true).filter(link => link.active).map(link => link.label), ['Conditions']);
  }
  for (const path of ['/plan', '/plan/shared-code']) {
    assert.deepEqual(siteNavigation(path, '', true).filter(link => link.active).map(link => link.label), ['Map']);
  }
  assert.deepEqual(siteNavigation('/find-float', '', true).filter(link => link.active).map(link => link.label), ['Floats']);
  assert.deepEqual(siteNavigation('/river-map', '', true).filter(link => link.active), []);
});

test('switching planning tabs preserves exact endpoints and vessel without copying unrelated state', () => {
  const links = floatNavigation('/plan', 'river=current&putIn=akers&takeOut=pulltite&vessel=kayak&submitPhoto=true&ct=campaign');
  assert.equal(links[1].href, '/find-float?river=current&putIn=akers&takeOut=pulltite&vessel=kayak');
  assert.equal(links[0].href, '/plan?river=current&putIn=akers&takeOut=pulltite&vessel=kayak');
  assert.equal(links[0].active, true);
  assert.equal(floatNavigation('/find-float', 'putIn=orphan')[0].href, '/plan');
  assert.equal(siteNavigation('/plan', 'river=current&putIn=akers&takeOut=pulltite&vessel=kayak', true).find(link => link.label === 'Map')?.href, links[0].href);
});

test('finder links retain endpoints without forwarding a vessel its form no longer uses', () => {
  const search = 'river=current&putIn=akers&takeOut=pulltite&vessel=kayak';
  assert.equal(floatNavigation('/find-float', search)[0].href, '/plan?river=current&putIn=akers&takeOut=pulltite');
  assert.equal(siteNavigation('/find-float', search, true).find(link => link.label === 'Map')?.href, '/plan?river=current&putIn=akers&takeOut=pulltite');
});

test('map deep links retain river/gauge intent before asynchronous catalogue reads arrive', () => {
  assert.deepEqual(readRiverMapSearch('river=current'), { river: 'current', gauge: null, conditions: [] });
  assert.deepEqual(readRiverMapSearch('gauge=07067000'), { river: null, gauge: '07067000', conditions: [] });
  assert.equal(readRiverMapSearch('river=current&gauge=07067000').gauge, null);
});

test('map selection changes replace the previous selection and clearing preserves filters and campaign', () => {
  const changed = writeRiverMapSearch('river=current&conditions=good&ct=partner', { gauge: '07067000' });
  assert.deepEqual(readRiverMapSearch(changed), { river: null, gauge: '07067000', conditions: ['good'] });
  const cleared = writeRiverMapSearch(changed, { gauge: null });
  assert.equal(new URLSearchParams(cleared).get('ct'), 'partner');
  assert.deepEqual(readRiverMapSearch(cleared), { river: null, gauge: null, conditions: ['good'] });
  assert.equal(readRiverMapSearch(writeRiverMapSearch(changed, { river: 'buffalo' })).gauge, null);
});

test('shared condition filters discard unknown values and serialize in stable order', () => {
  assert.deepEqual(readRiverMapSearch('conditions=good,nonsense,good').conditions, ['good']);
  const query = writeRiverMapSearch('river=current', { conditions: ['good', 'flowing', 'good'] });
  assert.deepEqual(readRiverMapSearch(query).conditions, readRiverMapSearch('conditions=flowing,good').conditions);
  assert.equal(writeRiverMapSearch(query, { conditions: [] }), 'river=current');
});
