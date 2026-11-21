// src/lib/eddy/outlook-prose.test.ts
// The river outlook serves a model-written Read only when the singular report
// routes would: after the live-water guard, and only to Premium.
//
// The outlook's short Read (`sections.eddyRead`) is what iOS falls back to when
// `fullRead` is withheld. It comes from the same model run as `fullRead`, so a
// run stale enough to withhold one is stale enough to withhold the other. These
// cases pin that the fallback reaches the code-written live line instead.

import assert from 'node:assert/strict';
import test from 'node:test';
import { loadOutlookProse, type StoredOutlookReport, type StoredRiverOutlookReport } from './outlook-prose';
import { buildEddyTakeSections, buildRiverOutlookState } from '../river-outlook';
import type { overlayLiveConditions } from '../social/live-conditions';

const NOW = new Date('2026-07-21T15:00:00Z');
const FRESH = '2026-07-21T14:00:00Z';
const STALE = '2026-07-19T14:00:00Z';

const riverReport: StoredRiverOutlookReport = {
  quote_text: 'The long Read, written this morning at a Flowing level.',
  summary_text: 'Flowing this morning.',
  eddy_read: 'Dialed in: easy pools and a steady push through the riffles.',
  condition_code: 'flowing',
  gauge_height_ft: 3.4,
  discharge_cfs: 900,
  generated_at: '2026-07-21T11:00:00Z',
};

const gaugeReport: StoredOutlookReport = {
  quote_text: 'The station Read, written at a Flowing level.',
  summary_text: 'Flowing at this station.',
  eddy_read: 'Dialed in at this station.',
  condition_code: 'flowing',
  generated_at: '2026-07-21T11:00:00Z',
};

/** An overlay that keeps the prose, as when live water still matches. */
const keeps = (async (_supabase: unknown, rows: Array<Record<string, unknown>>) =>
  rows.map((row) => ({ ...row, reading_timestamp: FRESH, snapshot_id: null }))) as unknown as typeof overlayLiveConditions;

/** An overlay that blanks the prose, as on a class change or a stale reading. */
const blanks = (async (_supabase: unknown, rows: Array<Record<string, unknown>>) =>
  rows.map((row) => ({ ...row, condition_code: 'high', quote_text: '', summary_text: null, reading_timestamp: FRESH, snapshot_id: null }))) as unknown as typeof overlayLiveConditions;

const fails = (async () => { throw new Error('live conditions unavailable'); }) as unknown as typeof overlayLiveConditions;

const neverCalled = (async () => { throw new Error('public outlook must not read live conditions'); }) as unknown as typeof overlayLiveConditions;

const base = { slug: 'current', liveCondition: 'flowing', readingTimestamp: FRESH, now: NOW };

function shownRead(generatedEddyRead: string | null, currentCondition: 'flowing' | 'high' = 'flowing') {
  const outlook = buildRiverOutlookState({
    weatherDays: [], weatherPending: false, weatherError: false,
    riverStages: [], riverPending: false, trend: null, stageThresholds: null, now: NOW,
  });
  return buildEddyTakeSections({ outlook, currentCondition, generatedEddyRead }).eddyRead;
}

test('a river report that still matches live water is served to Premium', async () => {
  const prose = await loadOutlookProse(null, { ...base, entitled: true, riverReport, gaugeReport: null, overlay: keeps });
  assert.equal(prose.fullRead, riverReport.quote_text);
  assert.equal(prose.eddyRead, riverReport.eddy_read);
  assert.equal(prose.generatedAt, riverReport.generated_at);
  assert.equal(shownRead(prose.eddyRead), riverReport.eddy_read);
});

test('when the overlay withholds the long Read, the short Read from that run goes too', async () => {
  const prose = await loadOutlookProse(null, { ...base, entitled: true, riverReport, gaugeReport: null, overlay: blanks });
  assert.deepEqual(prose, { fullRead: null, eddyRead: null, generatedAt: null });
  // What iOS shows as `outlook.fullRead || sections.eddyRead`: the live line,
  // not "Dialed in" beside a High badge.
  const read = shownRead(prose.eddyRead, 'high');
  assert.notEqual(read, riverReport.eddy_read);
  assert.match(read, /verified now/);
});

test('a failed overlay withholds every generated field', async () => {
  const prose = await loadOutlookProse(null, { ...base, entitled: true, riverReport, gaugeReport: null, overlay: fails });
  assert.deepEqual(prose, { fullRead: null, eddyRead: null, generatedAt: null });
});

test('a picked gauge withholds its short Read on a material move or a stale reading', async () => {
  const kept = await loadOutlookProse(null, { ...base, entitled: true, riverReport: null, gaugeReport });
  assert.equal(kept.fullRead, gaugeReport.quote_text);
  assert.equal(kept.eddyRead, gaugeReport.eddy_read);

  const moved = await loadOutlookProse(null, { ...base, liveCondition: 'high', entitled: true, riverReport: null, gaugeReport });
  assert.deepEqual(moved, { fullRead: null, eddyRead: null, generatedAt: null });

  const stale = await loadOutlookProse(null, { ...base, readingTimestamp: STALE, entitled: true, riverReport: null, gaugeReport });
  assert.deepEqual(stale, { fullRead: null, eddyRead: null, generatedAt: null });

  const unread = await loadOutlookProse(null, { ...base, readingTimestamp: null, entitled: true, riverReport: null, gaugeReport });
  assert.deepEqual(unread, { fullRead: null, eddyRead: null, generatedAt: null });
});

test('the model-written short Read is Premium, as on the singular report routes', async () => {
  for (const input of [
    { riverReport, gaugeReport: null },
    { riverReport: null, gaugeReport },
  ]) {
    const prose = await loadOutlookProse(null, { ...base, ...input, entitled: false, overlay: neverCalled });
    assert.deepEqual(prose, { fullRead: null, eddyRead: null, generatedAt: null });
  }
  assert.match(shownRead(null), /verified now/);
});

test('a short Read cannot outlive both safety-checked fields of its run', async () => {
  const proseless = { ...gaugeReport, quote_text: '', summary_text: null };
  const prose = await loadOutlookProse(null, { ...base, entitled: true, riverReport: null, gaugeReport: proseless });
  assert.deepEqual(prose, { fullRead: null, eddyRead: null, generatedAt: null });
});
