import assert from 'node:assert/strict';
import test from 'node:test';
import type { DamGenerationAlert } from '@eddy/types';
import {
  applyDamAlert,
  changedDamAlertTimes,
  DAM_ALERT_LOAD_FAILED,
  DAM_ALERT_NOTE,
  damAlertCardView,
  damAlertSummary,
  damAlertTimes,
  hasDamAlert,
  NO_DAM_ALERT,
  reconcileDamAlert,
  statusAfterLoad,
  turnsDamAlertOn,
} from '../../../eddy-ios/src/lib/damAlerts';
import { notificationDestination } from '../../../eddy-ios/src/lib/notificationDestination';

// The Expo app has no test runner, so its pure logic is covered here — the same
// arrangement as alert-groups.test.ts.
//
// What this protects: a dam generation alert has two times and NO paused
// state. Both off means the alert is gone, on the phone exactly as on the
// server, so the dam screen's switches and the Alerts tab never show an alert
// that cannot fire. See docs/decisions/0020.

const TABLE_ROCK = { id: 'swl-table-rock-dam', name: 'Table Rock Dam' };
const NOW = '2026-11-17T23:00:00.000Z';

function alert(over: Partial<DamGenerationAlert> = {}): DamGenerationAlert {
  return { damId: TABLE_ROCK.id, damName: TABLE_ROCK.name, atStart: true, hourBefore: false, createdAt: NOW, ...over };
}

test('a dam with no alert, or a list that has not loaded, reads as both switches off', () => {
  assert.deepEqual(damAlertTimes(null, TABLE_ROCK.id), NO_DAM_ALERT);
  assert.deepEqual(damAlertTimes([], TABLE_ROCK.id), NO_DAM_ALERT);
  assert.deepEqual(damAlertTimes([alert()], 'swl-norfork-dam'), NO_DAM_ALERT);
  assert.deepEqual(damAlertTimes([alert({ hourBefore: true })], TABLE_ROCK.id), { atStart: true, hourBefore: true });
  assert.equal(hasDamAlert(NO_DAM_ALERT), false);
  assert.equal(hasDamAlert({ atStart: false, hourBefore: true }), true);
});

test('switching the first time on adds the alert at the top', () => {
  const other = alert({ damId: 'swl-norfork-dam', damName: 'Norfork Dam' });
  const next = applyDamAlert([other], TABLE_ROCK, { atStart: false, hourBefore: true }, NOW);
  assert.deepEqual(next.map((a) => a.damId), [TABLE_ROCK.id, 'swl-norfork-dam']);
  assert.deepEqual(damAlertTimes(next, TABLE_ROCK.id), { atStart: false, hourBefore: true });
});

test('changing a time keeps the alert in place with its creation time', () => {
  const first = alert({ createdAt: '2026-11-01T00:00:00.000Z' });
  const other = alert({ damId: 'swl-norfork-dam', damName: 'Norfork Dam' });
  const next = applyDamAlert([other, first], TABLE_ROCK, { atStart: true, hourBefore: true }, NOW);
  assert.deepEqual(next.map((a) => a.damId), ['swl-norfork-dam', TABLE_ROCK.id]);
  assert.equal(next[1].createdAt, '2026-11-01T00:00:00.000Z');
  assert.equal(next[1].hourBefore, true);
});

test('switching both times off removes the alert rather than pausing it', () => {
  const other = alert({ damId: 'swl-norfork-dam', damName: 'Norfork Dam' });
  const next = applyDamAlert([alert(), other], TABLE_ROCK, NO_DAM_ALERT, NOW);
  assert.deepEqual(next.map((a) => a.damId), ['swl-norfork-dam']);
});

test('a failed first load is not an answer: the card offers retry instead of switches', () => {
  // The reported bug: the request failed, the provider called itself ready,
  // and both switches read off and editable over an alert still on.
  assert.equal(statusAfterLoad('failed', false), 'failed');
  assert.equal(damAlertCardView('failed'), 'failed');
  assert.equal(DAM_ALERT_LOAD_FAILED, 'Couldn’t load alert settings.');
});

test('switches are drawn only for confirmed settings', () => {
  assert.equal(damAlertCardView('loading'), 'loading');
  assert.equal(damAlertCardView('loaded'), 'switches');
  // No account can hold no alert, so off is the truth and a tap opens sign-in.
  assert.equal(damAlertCardView('signed-out'), 'switches');
  assert.equal(statusAfterLoad('loaded', false), 'loaded');
  assert.equal(statusAfterLoad('signed-out', true), 'signed-out');
});

test('a failed refresh keeps a list the server already confirmed', () => {
  assert.equal(statusAfterLoad('failed', true), 'loaded');
});

test('a switch changes only its own time in what the app shows', () => {
  assert.deepEqual(changedDamAlertTimes({ atStart: true, hourBefore: false }, { hourBefore: true }), {
    atStart: true,
    hourBefore: true,
  });
  assert.equal(turnsDamAlertOn({ hourBefore: true }), true);
  assert.equal(turnsDamAlertOn({ atStart: false }), false);
});

test('the server answer replaces the guess, bringing back a time the app did not know was on', () => {
  // The list had not loaded: the app showed both off, the person switched
  // "1 hour before" on, and the app guessed that was the whole alert.
  const guess = applyDamAlert([], TABLE_ROCK, changedDamAlertTimes(damAlertTimes(null, TABLE_ROCK.id), { hourBefore: true }), NOW);
  assert.deepEqual(damAlertTimes(guess, TABLE_ROCK.id), { atStart: false, hourBefore: true });

  // The server kept the "at the start" that was already saved.
  const saved = alert({ atStart: true, hourBefore: true, createdAt: '2026-11-01T00:00:00.000Z' });
  const next = reconcileDamAlert(guess, TABLE_ROCK.id, saved);
  assert.deepEqual(damAlertTimes(next, TABLE_ROCK.id), { atStart: true, hourBefore: true });
  assert.equal(next[0].createdAt, '2026-11-01T00:00:00.000Z');
});

test('a null answer removes the alert, and an answer for an unlisted dam is added', () => {
  const other = alert({ damId: 'swl-norfork-dam', damName: 'Norfork Dam' });
  assert.deepEqual(reconcileDamAlert([alert(), other], TABLE_ROCK.id, null).map((a) => a.damId), ['swl-norfork-dam']);
  assert.deepEqual(reconcileDamAlert([other], TABLE_ROCK.id, alert()).map((a) => a.damId), [TABLE_ROCK.id, 'swl-norfork-dam']);
});

test('the Alerts row says which times are on, and says posted', () => {
  assert.equal(damAlertSummary({ atStart: true, hourBefore: true }), 'Posted generation: 1 hour before and at the start');
  assert.equal(damAlertSummary({ atStart: false, hourBefore: true }), 'Posted generation: 1 hour before');
  assert.equal(damAlertSummary({ atStart: true, hourBefore: false }), 'Posted generation: at the start');
});

test('the note beside the switches states the limit of a schedule alert', () => {
  assert.match(DAM_ALERT_NOTE, /posted schedule/);
  assert.match(DAM_ALERT_NOTE, /at the dam/);
  assert.match(DAM_ALERT_NOTE, /can start without being posted/);
});

test('a dam generation push opens its dam, and river or gauge pushes are unchanged', () => {
  assert.deepEqual(notificationDestination({ damId: TABLE_ROCK.id, kind: 'generation_start' }), {
    pathname: '/dam/[damId]',
    params: { damId: TABLE_ROCK.id },
  });
  assert.deepEqual(notificationDestination({ riverSlug: 'current', damId: TABLE_ROCK.id }), {
    pathname: '/river/[slug]',
    params: { slug: 'current' },
  });
  assert.equal(notificationDestination({ damId: '' }), null);
});
