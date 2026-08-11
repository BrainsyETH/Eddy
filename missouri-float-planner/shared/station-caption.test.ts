import assert from 'node:assert/strict';
import test from 'node:test';
import { looksLikeUsgsSiteId, providerLabel, stationCaption } from './station-caption';

// ── The captions both apps print ───────────────────────────────────────────
//
// These assertions are the contract between the web search route and the iOS
// app, which used to hold two copies of this rule and had already drifted. If a
// caption changes, it changes in both places or not at all.

test('a USGS station is credited with the number people look up', () => {
  assert.equal(stationCaption('usgs', '07071500'), 'USGS 07071500');
});

test('a slug-identified station is credited to its operator, never by its slug', () => {
  // The defect this whole module exists for: 'swl-clearwater-dam' is an Eddy
  // id. Printing it reads as a citation and cites nothing.
  assert.equal(stationCaption('usace', 'swl-clearwater-dam'), 'USACE release');
  assert.equal(stationCaption('nws', 'VBUM7'), 'NWS gauge');
});

test('an empty site id never produces a caption with a hole in it', () => {
  // 'USGS ' with a trailing space is what a `siteId ?? ''` call site produces
  // when the guard lives at the call site instead of here.
  assert.equal(stationCaption('usgs', ''), 'USGS gauge');
  assert.equal(stationCaption('usgs', '   '), 'USGS gauge');
  assert.equal(stationCaption('usgs', null), 'USGS gauge');
  assert.equal(stationCaption('usgs', undefined), 'USGS gauge');
});

test('an unknown provider keeps a USGS site number rather than losing the row', () => {
  // A star saved before 1.1, or any client talking to a backend deployed before
  // search_gauges grew its provider column. The number attributes nothing and
  // still says which station this is; dropping it leaves a bare "Gauge".
  assert.equal(stationCaption(null, '07071500'), '07071500');
  assert.equal(stationCaption(undefined, '07071500'), '07071500');
  assert.equal(stationCaption(null, '  07071500  '), '07071500');
});

test('an unknown provider says nothing about an id that is not a site number', () => {
  // The half of the fallback that matters: a slug must not be promoted to a
  // citation just because nobody said who published it.
  assert.equal(stationCaption(null, 'swl-clearwater-dam'), null);
  assert.equal(stationCaption(null, 'VBUM7'), null);
  assert.equal(stationCaption(null, null), null);
  assert.equal(stationCaption('something-new', 'swl-table-rock-dam'), null);
});

test('the site-number shape is anchored, not merely contained', () => {
  // A slug that happens to hold eight digits is still a slug.
  assert.equal(stationCaption(null, 'swl-07071500'), null);
  assert.equal(stationCaption(null, '07071500-a'), null);
  // Too short to be a site number, and too long.
  assert.equal(stationCaption(null, '0707150'), null);
  assert.equal(stationCaption(null, '0123456789012345'), null);
  // The boundaries themselves.
  assert.equal(stationCaption(null, '07071500'), '07071500');
  assert.equal(stationCaption(null, '012345678901234'), '012345678901234');
});

test('the shape test and the caption fallback cannot disagree', () => {
  // They are the same rule, so they are the same function. The app's not-found
  // screen decides whether to offer a waterdata.usgs.gov link with this, and it
  // must never say yes about an id the caption refused to print unattributed.
  for (const id of ['07071500', '012345678901234', 'swl-clearwater-dam', 'VBUM7', '0707150', '']) {
    assert.equal(
      looksLikeUsgsSiteId(id),
      stationCaption(null, id) !== null,
      `disagreed about ${JSON.stringify(id)}`,
    );
  }
});

test('the shape test is evidence about an id, not provenance about a station', () => {
  assert.equal(looksLikeUsgsSiteId('07071500'), true);
  assert.equal(looksLikeUsgsSiteId('  07071500  '), true);
  assert.equal(looksLikeUsgsSiteId('swl-clearwater-dam'), false);
  assert.equal(looksLikeUsgsSiteId('VBUM7'), false);
  assert.equal(looksLikeUsgsSiteId(null), false);
  assert.equal(looksLikeUsgsSiteId(undefined), false);
  assert.equal(looksLikeUsgsSiteId(''), false);
  assert.equal(looksLikeUsgsSiteId('   '), false);
});

test('providerLabel names an operator and refuses to guess one', () => {
  assert.equal(providerLabel('usgs'), 'USGS');
  assert.equal(providerLabel('nws'), 'NWS');
  assert.equal(providerLabel('usace'), 'USACE');
  assert.equal(providerLabel(null), null);
  assert.equal(providerLabel(undefined), null);
  assert.equal(providerLabel('noaa'), null);
});

test('providerLabel is not fooled by an inherited property name', () => {
  // A registry id arrives from the database and from a cached wire payload, so
  // the lookup must not be a bare object index.
  assert.equal(providerLabel('constructor'), null);
  assert.equal(providerLabel('__proto__'), null);
  assert.equal(providerLabel('toString'), null);
});
