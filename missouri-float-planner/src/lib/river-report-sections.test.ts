import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sectionFromUrl, sectionGauge, riverSectionLabel, type RiverReportSection } from './river-report-sections';

const sections: RiverReportSection[] = [
  { sectionSlug: 'upper-lesterville', name: 'Upper Black (Lesterville to Hwy K / Annapolis)', riverType: 'spring_fed_float', gaugeStationId: 'annapolis' },
  { sectionSlug: 'lower-markham-hammer', name: 'Lower Black (Markham Springs to Hammer, below Clearwater Dam)', riverType: 'dam_tailwater', gaugeStationId: 'poplar-bluff' },
];
const url = (suffix: string) => new URL(`https://eddy.guide/rivers/missouri/black${suffix}`);

test('dam links and legacy reach anchors select the requested section', () => {
  assert.equal(sectionFromUrl(sections, url('?section=lower-markham-hammer')), 'lower-markham-hammer');
  assert.equal(sectionFromUrl(sections, url('#reach-lower-markham-hammer')), 'lower-markham-hammer');
  assert.equal(sectionFromUrl(sections, url('?section=upper-lesterville#reach-lower-markham-hammer')), 'lower-markham-hammer');
  assert.equal(sectionFromUrl(sections, url('?section=lower-markham-hammer#access')), 'lower-markham-hammer');
});

test('missing/invalid selections resolve consistently, without hiding valid sections', () => {
  for (const suffix of ['', '?section=removed', '#reach-removed', '?section=%3Cscript%3E']) {
    assert.equal(sectionFromUrl(sections, url(suffix)), 'upper-lesterville');
  }
  assert.equal(sectionFromUrl([], url('')), null);
});

test('a missing lower gauge never borrows the primary reading across Clearwater Dam', () => {
  const upper = { id: 'annapolis', reading: 3.8 };
  const lower = { id: 'poplar-bluff', reading: 0.3 };
  assert.equal(sectionGauge(sections[1], [upper, lower]), lower);
  assert.equal(sectionGauge(sections[1], [upper]), null);
  assert.equal(sectionGauge({ ...sections[1], gaugeStationId: null }, [upper, lower]), null);
});

test('selector labels retain access endpoints without repeating the dam explanation', () => {
  assert.deepEqual(riverSectionLabel(sections[0]), { title: 'Upper Black', subtitle: 'Lesterville–Hwy K' });
  assert.deepEqual(riverSectionLabel(sections[1]), { title: 'Lower Black', subtitle: 'Markham Springs–Hammer' });
  assert.deepEqual(riverSectionLabel({ ...sections[0], sectionSlug: 'another', name: 'Middle river (A to B)' }), { title: 'Middle river', subtitle: 'A to B' });
});
