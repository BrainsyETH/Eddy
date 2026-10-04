import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAppleIdentity } from '../../../eddy-ios/src/lib/appleIdentity';
import { addStars, mergeStars } from '../../../packages/eddy-sync/index';

const success = (id: string) => ({ data: { session: { user: { id } } }, error: null });
const failure = (code: string) => ({ data: { session: null }, error: { code, message: code } });

test('first Apple signup explicitly links the guest identity', async () => {
  const calls: string[] = [];
  const session = await resolveAppleIdentity({ anonymous: true,
    link: async () => { calls.push('link'); return success('guest'); },
    signIn: async () => { calls.push('signIn'); return success('new-user'); },
  });
  assert.equal(session.user.id, 'guest');
  assert.deepEqual(calls, ['link']);
});

test('existing Apple account restores its identity after a link conflict', async () => {
  const calls: string[] = [];
  const session = await resolveAppleIdentity({ anonymous: true,
    link: async () => { calls.push('link'); return failure('identity_already_exists'); },
    signIn: async () => { calls.push('signIn'); return success('returning-user'); },
  });
  assert.equal(session.user.id, 'returning-user');
  assert.deepEqual(calls, ['link', 'signIn']);
});

test('disabled linking and other failures never abandon the guest with a fresh sign-in', async () => {
  for (const code of ['manual_linking_disabled', 'request_timeout', 'unexpected_failure']) {
    let signedIn = false;
    await assert.rejects(resolveAppleIdentity({ anonymous: true,
      link: async () => failure(code),
      signIn: async () => { signedIn = true; return success('wrong-user'); },
    }));
    assert.equal(signedIn, false);
  }
});

test('no guest session uses ordinary sign-in; a missing session is a failure', async () => {
  assert.equal((await resolveAppleIdentity({ anonymous: false,
    link: async () => { throw new Error('must not link'); },
    signIn: async () => success('returning-user'),
  })).user.id, 'returning-user');
  await assert.rejects(resolveAppleIdentity({ anonymous: false,
    link: async () => success('unused'),
    signIn: async () => ({ data: { session: null }, error: null }),
  }), /did not create a session/);
});

test('new onboarding favorites are added to a returning account without removing its favorites', () => {
  const local = addStars([], [{ kind: 'river', entityId: 'new-river', name: 'New river', slug: 'new-river' }], '2026-10-03T12:00:00Z');
  const plan = mergeStars(local, [{ kind: 'river', entityId: 'existing-river', name: 'Existing river', slug: 'existing-river', starredAt: '2026-09-01T12:00:00Z' }], 'river');
  assert.deepEqual(plan.toStar, ['new-river']);
  assert.deepEqual(plan.toUnstar, []);
  assert.deepEqual(new Set(plan.merged.map(item => item.entityId)), new Set(['existing-river', 'new-river']));
});
