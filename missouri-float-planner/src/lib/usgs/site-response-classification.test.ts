import assert from 'node:assert/strict';
import test from 'node:test';
import type { OgcFeature } from '@/lib/flow-providers/usgs';
import {
  classifyBatchResponse,
  classifyRecordEndsResponse,
  classifySiteMetadataResponse,
} from './national-sites';

// ── why this file exists ─────────────────────────────────────────────
//
// These two functions decide, for a batch of stations, whether USGS told us
// anything. That decision is the whole safety story of the usgs_site_drift
// check: "USGS publishes no flow record for this station" is a high-severity
// finding, and "the response was not usable" must produce silence. Get them
// confused and a degraded endpoint becomes a mass decommission notice.
//
// It happened. fetchSiteRecordEnds() originally defaulted every station in a
// batch to null BEFORE checking whether the response was usable, so a 200 with
// zero features — a silently changed filter, a degraded endpoint, a malformed
// body — would have filed usgs_site_record_ended for all 43 wired gauges at
// once, at high severity. The sibling function written in the same commit had
// the guard; this one did not.
//
// The ladder is shared and pure now, so both inherit every guard and the
// semantics can be tested without standing up a fake network. That is the point
// of the extraction: these are the assertions that could not be written before.

function locationFeature(siteId: string, over: Record<string, unknown> = {}): OgcFeature {
  return {
    id: `USGS-${siteId}`,
    properties: {
      agency_code: 'USGS',
      monitoring_location_number: siteId,
      monitoring_location_name: `Station ${siteId}`,
      state_name: 'Missouri',
      county_name: 'Crawford County',
      hydrologic_unit_code: '071401020408',
      site_type_code: 'ST',
      drainage_area: 259,
      ...over,
    },
    geometry: { type: 'Point', coordinates: [-91.204, 37.974] },
  } as unknown as OgcFeature;
}

function seriesFeature(siteId: string, end: unknown, endUtc: unknown = end): OgcFeature {
  return {
    id: `${siteId}-series`,
    properties: {
      monitoring_location_id: `USGS-${siteId}`,
      parameter_code: '00060',
      end,
      end_utc: endUtc,
    },
  } as unknown as OgcFeature;
}

const BATCH = ['07014000', '07019000', '07067000'];

// ── the ladder itself ────────────────────────────────────────────────

test('a response with no features at all is refused', () => {
  // The regression this whole file is named for. Indistinguishable from a
  // filter USGS silently stopped honouring, and the production batch is known
  // to contain live gauges — so "none of these has any data" describes a broken
  // request far better than it describes the rivers.
  assert.equal(classifyBatchResponse(0, 10, 0), 'empty_response');
});

test('a response that hit the limit is refused', () => {
  // More rows may sit on a page nobody read, so every value derived from this
  // batch is a possible under-estimate — and under-estimating a record end
  // reads as "this station died".
  assert.equal(classifyBatchResponse(10, 10, 3), 'limit_saturated');
});

test('a response about nobody we asked for is refused', () => {
  // Features came back and not one is about a station in the batch. That is a
  // filter doing something other than what the query said.
  assert.equal(classifyBatchResponse(5, 10, 0), 'no_batch_matches');
});

test('a partial answer is NOT refused', () => {
  // Deliberate, and the line worth defending: some stations answering and
  // others not is the normal shape of a real response. Refusing it would make
  // the rules unable to fire at all, which is its own kind of blindness.
  assert.equal(classifyBatchResponse(4, 10, 2), null);
});

// ── record ends: the function that had the bug ───────────────────────

test('a zero-feature response never yields a single null end', () => {
  // The exact failure: 200 OK, no features, and every station in the batch
  // silently answered "no flow or stage record" — 43 false high-severity
  // findings from one degraded response.
  const outcome = classifyRecordEndsResponse(BATCH, [], 36);
  assert.equal(outcome.reached, false);
  assert.equal(outcome.reached === false && outcome.refusal, 'empty_response');
});

test('features about other stations do not turn our batch into nulls', () => {
  // A filter that returns arbitrary rows would otherwise look structurally fine
  // — features present, count under the limit — while every station we asked
  // about stayed at its null default.
  const outcome = classifyRecordEndsResponse(BATCH, [seriesFeature('99999999', '2026-08-10')], 36);
  assert.equal(outcome.reached, false);
  assert.equal(outcome.reached === false && outcome.refusal, 'no_batch_matches');
});

test('a saturated response is refused rather than under-reporting', () => {
  const features = Array.from({ length: 6 }, () => seriesFeature('07014000', '2026-08-10'));
  const outcome = classifyRecordEndsResponse(BATCH, features, 6);
  assert.equal(outcome.reached, false);
  assert.equal(outcome.reached === false && outcome.refusal, 'limit_saturated');
});

test('a real answer keeps the newest end per station', () => {
  const outcome = classifyRecordEndsResponse(BATCH, [
    seriesFeature('07014000', '2023-12-31T18:00:00', '2024-01-01T00:00:00Z'),
    seriesFeature('07014000', '2026-08-10T01:30:00', '2026-08-10T06:30:00Z'),
    seriesFeature('07014000', '2025-05-04T19:00:00', '2025-05-05T00:00:00Z'),
    seriesFeature('07019000', '2026-08-08T19:00:00', '2026-08-09T00:00:00Z'),
  ], 36);

  assert.equal(outcome.reached, true);
  if (!outcome.reached) return;
  assert.equal(outcome.data.get('07014000')?.toISOString(), '2026-08-10T06:30:00.000Z');
  assert.equal(outcome.data.get('07019000')?.toISOString(), '2026-08-09T00:00:00.000Z');
  // Asked about, answered about, and it has no series — the genuine null.
  assert.equal(outcome.data.get('07067000'), null);
  assert.equal(outcome.data.size, 3, 'every station in a reached batch gets an entry');
});

test('end_utc wins over the station-local compatibility timestamp', () => {
  const outcome = classifyRecordEndsResponse(
    ['07014000'],
    [seriesFeature('07014000', '2026-08-10T01:30:00', '2026-08-10T09:30:00Z')],
    12,
  );

  assert.equal(outcome.reached, true);
  if (!outcome.reached) return;
  assert.equal(outcome.data.get('07014000')?.toISOString(), '2026-08-10T09:30:00.000Z');
});

test('the shapes USGS actually sends parse to the instant they name', () => {
  // Fixtures elsewhere in this file abbreviate the offset as 'Z'. The live
  // time-series-metadata collection does not: it answers
  //   "end":     "2026-08-09T00:00:00.000001"      (station-local, no zone)
  //   "end_utc": "2026-08-09T05:00:00+00:00"       (explicit +00:00)
  // Both the microsecond tail and the spelled-out zero offset have to survive,
  // so at least one case asserts against the real wire shape rather than a
  // tidied one — the zone-detection regex is what this is really testing.
  const outcome = classifyRecordEndsResponse(
    ['07014000', '07019000'],
    [
      seriesFeature('07014000', '2026-08-09T00:00:00.000001', '2026-08-09T05:00:00+00:00'),
      // The same station-local value with no end_utc beside it: the fallback
      // reads it as UTC, which is what makes the check TZ-independent.
      seriesFeature('07019000', '2026-08-09T00:00:00.000001', undefined),
    ],
    12,
  );

  assert.equal(outcome.reached, true);
  if (!outcome.reached) return;
  assert.equal(outcome.data.get('07014000')?.toISOString(), '2026-08-09T05:00:00.000Z');
  assert.equal(outcome.data.get('07019000')?.toISOString(), '2026-08-09T00:00:00.000Z');
});

test('a legacy timezone-less end is deterministic when end_utc is absent', () => {
  const outcome = classifyRecordEndsResponse(
    ['07014000'],
    [seriesFeature('07014000', '2026-08-10T06:30:00', undefined)],
    12,
  );

  assert.equal(outcome.reached, true);
  if (!outcome.reached) return;
  assert.equal(outcome.data.get('07014000')?.toISOString(), '2026-08-10T06:30:00.000Z');
});

test('a malformed end is ignored without discarding the station', () => {
  // USGS answered about this station; the timestamp is junk. That is not a
  // filter failure — counting it as one would refuse a response that is
  // structurally fine. The station is left at null, which is the honest reading
  // of "we have no usable end for it".
  const outcome = classifyRecordEndsResponse(BATCH, [
    seriesFeature('07014000', 'not-a-date'),
    seriesFeature('07019000', '2026-08-08T19:00:00', '2026-08-09T00:00:00Z'),
  ], 36);

  assert.equal(outcome.reached, true);
  if (!outcome.reached) return;
  assert.equal(outcome.data.get('07014000'), null);
  assert.equal(outcome.data.get('07019000')?.toISOString(), '2026-08-09T00:00:00.000Z');
});

test('a non-string end, a missing end and a null property are all survivable', () => {
  const outcome = classifyRecordEndsResponse(BATCH, [
    seriesFeature('07014000', 1723276800000),
    seriesFeature('07019000', undefined),
    { id: 'x', properties: null } as unknown as OgcFeature,
    seriesFeature('07067000', '2026-07-31T19:00:00', '2026-08-01T00:00:00Z'),
  ], 36);

  assert.equal(outcome.reached, true);
  if (!outcome.reached) return;
  assert.equal(outcome.data.get('07014000'), null);
  assert.equal(outcome.data.get('07019000'), null);
  assert.equal(outcome.data.get('07067000')?.toISOString(), '2026-08-01T00:00:00.000Z');
});

test('a station is only ever keyed within its own batch', () => {
  // The other bug in the original loop: it tested membership against a map that
  // accumulated across batches, so a feature in batch two could overwrite a
  // station already answered in batch one.
  const outcome = classifyRecordEndsResponse(['07014000'], [
    seriesFeature('07014000', '2026-08-10T00:00:00'),
    seriesFeature('07019000', '2020-01-01T00:00:00'),
  ], 12);

  assert.equal(outcome.reached, true);
  if (!outcome.reached) return;
  assert.equal(outcome.data.size, 1);
  assert.equal(outcome.data.has('07019000'), false, 'a station outside the batch is not answered');
});

// ── site metadata: the same ladder, and the identity rules ───────────

test('a zero-feature location response is refused', () => {
  const outcome = classifySiteMetadataResponse(BATCH, [], 7);
  assert.equal(outcome.reached, false);
  assert.equal(outcome.reached === false && outcome.refusal, 'empty_response');
});

test('another agency sharing a site number cannot answer for USGS', () => {
  // A monitoring location is agency_code + monitoring_location_number. Keyed by
  // number alone, whichever row arrived last would win — silently replacing a
  // USGS station's coordinates with someone else's.
  const outcome = classifySiteMetadataResponse(BATCH, [
    locationFeature('07014000', { agency_code: 'USEPA', monitoring_location_name: 'Not ours' }),
    locationFeature('07019000'),
  ], 7);

  assert.equal(outcome.reached, true);
  if (!outcome.reached) return;
  assert.equal(outcome.data.has('07014000'), false, 'a non-USGS row is not an answer');
  assert.equal(outcome.data.get('07019000')?.name, 'Station 07019000');
});

test('a response of only foreign-agency rows is refused, not read as three unknowns', () => {
  // Without the no_batch_matches rung this would return an empty map, and every
  // station in the batch would be reported as an unknown identifier.
  const outcome = classifySiteMetadataResponse(BATCH, [
    locationFeature('07014000', { agency_code: 'USEPA' }),
  ], 7);
  assert.equal(outcome.reached, false);
  assert.equal(outcome.reached === false && outcome.refusal, 'no_batch_matches');
});

test('a station outside the batch is not smuggled into the answer', () => {
  const outcome = classifySiteMetadataResponse(BATCH, [
    locationFeature('07014000'),
    locationFeature('05497485'),
  ], 7);

  assert.equal(outcome.reached, true);
  if (!outcome.reached) return;
  assert.equal(outcome.data.has('05497485'), false);
  assert.equal(outcome.data.size, 1);
});

test('a genuinely unknown id stays absent from a response that answered others', () => {
  // This is what makes usgs_site_unknown reportable at all: two of three
  // answered, so the response is usable, and the third is honestly missing.
  const outcome = classifySiteMetadataResponse(BATCH, [
    locationFeature('07014000'),
    locationFeature('07019000'),
  ], 7);

  assert.equal(outcome.reached, true);
  if (!outcome.reached) return;
  assert.equal(outcome.data.has('07067000'), false);
});
