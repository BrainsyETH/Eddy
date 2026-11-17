import assert from 'node:assert/strict';
import test from 'node:test';
import { riverNoteDefect, usableRiverNote } from './river-note';

test('the ingest bookkeeping string is not a river note', () => {
  // The exact shapes production held on 2026-11-16.
  const withUndefined =
    'Per-section hydro types: wolf-pen-to-redding=undefined, redding-to-turner-bend=undefined. River-level default: rain_flashy.';
  const wellFormed = 'Per-section hydro types: upper-lesterville=spring_fed_float. River-level default: spring_fed_float.';
  assert.equal(riverNoteDefect(withUndefined), 'ingestion_placeholder');
  // Well-formed bookkeeping is still bookkeeping: it names slugs and enum
  // values, not anything a floater or a model can use about the gauge.
  assert.equal(riverNoteDefect(wellFormed), 'ingestion_placeholder');
  assert.equal(usableRiverNote(withUndefined), null);
  assert.equal(usableRiverNote(wellFormed), null);
});

test('a note that interpolated a missing value is rejected', () => {
  assert.equal(riverNoteDefect('Drop rate: undefined'), 'unrendered_value');
  assert.equal(riverNoteDefect('Reach type=null for the upper river.'), 'unrendered_value');
  assert.equal(riverNoteDefect('Hazards: [object Object]'), 'unrendered_value');
});

test('real notes pass through, trimmed', () => {
  const note = 'Spring-fed with a consistent base flow. Upper sections (Montauk to Akers) are shallower than the lower stretches.';
  assert.equal(riverNoteDefect(note), null);
  assert.equal(usableRiverNote(`  ${note}\n`), note);
  // The bare words are ordinary English and must not trip the guard.
  assert.equal(riverNoteDefect('The channel is undefined through the willows, and null flow is rare.'), null);
});

test('an absent note is absent, not defective', () => {
  for (const empty of [null, undefined, '', '   ']) {
    assert.equal(riverNoteDefect(empty), null);
    assert.equal(usableRiverNote(empty), null);
  }
});
