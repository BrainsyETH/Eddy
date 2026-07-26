// src/lib/account-deletion.test.ts
// Guards the two properties of account deletion that are silent when broken.
//
// Neither is testable against the real database here, and both fail in a way
// nobody would notice from the outside: the account still disappears, the API
// still returns 200, and the user's saved floats quietly become public.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { deleteAccount, EXPLICIT_DELETE_TABLES } from './account-deletion';

const USER = '11111111-1111-1111-1111-111111111111';

/**
 * Minimal stand-in for the service-role client, recording call order.
 */
function fakeAdmin(opts: { failOn?: string } = {}) {
  const calls: string[] = [];

  const client = {
    from(table: string) {
      return {
        delete() {
          return {
            eq(_column: string, _value: string) {
              return {
                select(_cols: string) {
                  calls.push(`delete:${table}`);
                  if (opts.failOn === table) {
                    return Promise.resolve({ data: null, error: { message: 'boom' } });
                  }
                  return Promise.resolve({ data: [{ id: 'a' }, { id: 'b' }], error: null });
                },
              };
            },
          };
        },
      };
    },
    auth: {
      admin: {
        deleteUser(_id: string) {
          calls.push('delete:auth.users');
          if (opts.failOn === 'auth.users') {
            return Promise.resolve({ data: null, error: { message: 'boom' } });
          }
          return Promise.resolve({ data: {}, error: null });
        },
      },
    },
  };

  return { client, calls };
}

test('float_plans stays on the explicit-delete list', () => {
  // Its FK is ON DELETE SET NULL, and float_plans treats user_id IS NULL as
  // the anonymous, world-readable tier (migration 00184). Relying on the
  // cascade would therefore PUBLISH a deleted user's saved floats rather than
  // remove them. If this assertion is failing because the entry was removed,
  // the fix is to change the FK to ON DELETE CASCADE first — not to delete
  // this test.
  const tables = EXPLICIT_DELETE_TABLES.map((t) => t.table);
  assert.ok(
    tables.includes('float_plans'),
    'float_plans must be deleted explicitly: its FK is SET NULL and a NULL user_id is publicly readable'
  );
});

test('owned data is deleted before the auth user', async () => {
  const { client, calls } = fakeAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await deleteAccount(client as any, USER);

  const authIndex = calls.indexOf('delete:auth.users');
  assert.notEqual(authIndex, -1, 'the auth user must be deleted');

  for (const { table } of EXPLICIT_DELETE_TABLES) {
    const tableIndex = calls.indexOf(`delete:${table}`);
    assert.notEqual(tableIndex, -1, `${table} must be deleted`);
    assert.ok(
      tableIndex < authIndex,
      `${table} must be deleted BEFORE the auth user — the cascade is what makes its rows public`
    );
  }
});

test('a failed owned-data delete aborts before the account is removed', async () => {
  const { client, calls } = fakeAdmin({ failOn: 'float_plans' });

  await assert.rejects(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => deleteAccount(client as any, USER),
    /Could not delete float_plans/
  );

  // The important half: the account still exists, so the user can retry.
  // Deleting it anyway would strand private rows behind an unreachable owner.
  assert.ok(
    !calls.includes('delete:auth.users'),
    'the auth user must not be deleted when owned data could not be'
  );
});

test('reports how many rows each table gave up', async () => {
  const { client } = fakeAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await deleteAccount(client as any, USER);

  assert.equal(result.deleted.float_plans, 2);
});
