// src/lib/alerts/river-alerts.test.ts
// The two rules in this feature that are safety-relevant, pinned.
//
// Neither is testable against the live agencies: the NWS publishes flood
// warnings only when there is flooding, so on an ordinary July day both feeds
// are legitimately empty and every assertion would pass vacuously. Fixtures are
// the only way to prove these hold on the day they matter.

import assert from 'node:assert/strict';
import test from 'node:test';
import { matchWeatherAlerts, npsSeverity, nwsSeverity } from './river-alerts';
import type { NWSAlert } from '@/lib/nws/alerts';

function nws(overrides: Partial<NWSAlert> = {}): NWSAlert {
  return {
    id: 'urn:oid:2.49.0.1.840.0.test',
    event: 'Flood Warning',
    headline: 'Flood Warning issued for Shannon County',
    description: 'The Current River at Van Buren is forecast to crest Thursday.',
    severity: 'Severe',
    urgency: 'Expected',
    onset: '2026-07-29T12:00:00-05:00',
    expires: '2026-07-30T12:00:00-05:00',
    areaDesc: 'Shannon, MO; Carter, MO',
    ...overrides,
  };
}

const CURRENT = {
  slug: 'current',
  name: 'Current River',
  state: 'MO',
  alertSearchTerms: ['current river', 'shannon county'],
};

test('an NWS Warning is louder than a Watch, which is louder than an Advisory', () => {
  assert.equal(nwsSeverity(nws({ event: 'Flood Warning' })), 'warning');
  assert.equal(nwsSeverity(nws({ event: 'Flash Flood Warning' })), 'warning');
  assert.equal(nwsSeverity(nws({ event: 'Flood Watch' })), 'watch');
  assert.equal(nwsSeverity(nws({ event: 'Flash Flood Watch' })), 'watch');
  assert.equal(nwsSeverity(nws({ event: 'Flood Advisory' })), 'notice');
  // The mildest thing the NWS publishes about water — "this could develop".
  assert.equal(nwsSeverity(nws({ event: 'Hydrologic Outlook' })), 'notice');
});

test('the event name outranks the severity field', () => {
  // A Watch flagged Extreme is still a watch. The last word of the event is the
  // distinction every weather app keys on and the one users already know;
  // promoting on `severity` would render "might happen" as "is happening".
  assert.equal(nwsSeverity(nws({ event: 'Flood Watch', severity: 'Extreme' })), 'watch');
});

test('an NPS closure is not a danger, and neither is a newsletter', () => {
  assert.equal(npsSeverity('Danger'), 'warning');
  // A closure stops the trip without being a hazard — it is a fact about a
  // gate, not about the water.
  assert.equal(npsSeverity('Closure'), 'watch');
  assert.equal(npsSeverity('Caution'), 'watch');
  assert.equal(npsSeverity('Information'), 'notice');
});

test('an unrecognised NPS category floors at notice and never promotes', () => {
  // THE RULE THAT MATTERS. The NPS documents four categories and ships others.
  // Anything we do not recognise must read as the mildest thing on the screen,
  // because the failure is silent: nobody reviews a category they have never
  // seen, and a park newsletter drawn in warning red is indistinguishable from
  // a real hazard until someone drives out for nothing — or worse, learns to
  // ignore the red.
  for (const unknown of ['Park Newsletter', 'Event', '', 'DANGER ZONE MERCH', 'urgent']) {
    assert.equal(npsSeverity(unknown), 'notice', `"${unknown}" must not promote`);
  }
  // Case and whitespace are the agency's business, not a reason to miss a real one.
  assert.equal(npsSeverity('  danger  '), 'warning');
  assert.equal(npsSeverity('CLOSURE'), 'watch');
});

test('a river with no search terms gets NO alerts, not every alert in its state', () => {
  // THE OTHER RULE THAT MATTERS. filterAlertsForRiver fails OPEN — it returns
  // the whole state when a river has no terms. Harmless feeding a prompt;
  // on a screen it would tell someone on a newly ingested creek that a flood
  // warning three counties away is theirs.
  const byState = new Map<string, NWSAlert[]>([['MO', [nws()]]]);

  const untermed = matchWeatherAlerts(
    [{ ...CURRENT, slug: 'brand-new', name: 'Brand New Creek', alertSearchTerms: null }],
    byState,
  );
  assert.deepEqual(untermed, [], 'a river with null terms must match nothing');

  const empty = matchWeatherAlerts([{ ...CURRENT, alertSearchTerms: [] }], byState);
  assert.deepEqual(empty, [], 'an empty terms array must match nothing either');
});

test('a matching river gets the alert, mapped onto our shape', () => {
  const byState = new Map<string, NWSAlert[]>([['MO', [nws()]]]);
  const [alert, ...rest] = matchWeatherAlerts([CURRENT], byState);

  assert.equal(rest.length, 0);
  assert.equal(alert.source, 'nws');
  assert.equal(alert.severity, 'warning');
  assert.equal(alert.riverSlug, 'current');
  assert.equal(alert.title, 'Flood Warning issued for Shannon County');
  // The agency's own word for it, shown verbatim beside the source.
  assert.equal(alert.category, 'Flood Warning');
  assert.equal(alert.url, null);
});

test('one alert matching two rivers produces two rows with distinct ids', () => {
  // Ozark NSR terms overlap: a Shannon County warning is genuinely about both
  // the Current and the Jacks Fork. Each is its own row, and a shared key would
  // make React render one.
  const byState = new Map<string, NWSAlert[]>([['MO', [nws()]]]);
  const jacksFork = {
    slug: 'jacks-fork',
    name: 'Jacks Fork River',
    state: 'MO',
    alertSearchTerms: ['jacks fork', 'shannon county'],
  };

  const rows = matchWeatherAlerts([CURRENT, jacksFork], byState);
  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map((r) => r.id)).size, 2, 'ids must be unique per river');
});

test('a river only sees its own state', () => {
  // The Buffalo is in Arkansas. A Missouri warning must not reach it even if
  // the text would match, or a river inherits weather from a state it is not in.
  const byState = new Map<string, NWSAlert[]>([['MO', [nws()]]]);
  const buffalo = {
    slug: 'buffalo',
    name: 'Buffalo National River',
    state: 'AR',
    alertSearchTerms: ['shannon county'], // deliberately matches the MO text
  };

  assert.deepEqual(matchWeatherAlerts([buffalo], byState), []);
});

test('a headline-less alert falls back to the event name', () => {
  const byState = new Map<string, NWSAlert[]>([
    ['MO', [nws({ headline: '', description: 'Shannon County. Water over roadways.' })]],
  ]);
  const [alert] = matchWeatherAlerts([CURRENT], byState);
  assert.equal(alert.title, 'Flood Warning', 'an empty headline must not render as a blank row');
});
