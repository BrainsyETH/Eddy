// src/lib/entitlement-id.test.ts
// Keeps the entitlement identifier identical on both sides of the repo.
//
// WHY THIS NEEDS A TEST AT ALL: the identifier is a RevenueCat dashboard key
// that has to match in three independent places — the dashboard, this backend,
// and the Expo app. It cannot be a single shared constant: Vercel builds the
// web app with Root Directory = missouri-float-planner/, so nothing here can
// import from packages/ at runtime, which is where a shared contract constant
// would otherwise live.
//
// WHY DRIFT IS EXPENSIVE: nothing throws. The webhook writes rows under one id
// while every read filters on another, so `entitlements` fills up correctly and
// /api/me/profile reports no subscription. The symptom is a customer who paid
// and has no access, and there is no error anywhere to find. It happened once
// already in miniature — the placeholder identifier was `eddy_plus`, the
// product shipped as Eddy Premium, and four literals had to move together.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_ENTITLEMENT_ID } from './entitlement';

const APP_PURCHASES = join(process.cwd(), '../eddy-ios/src/lib/purchases.ts');

test('the app and the backend agree on the entitlement identifier', () => {
  const source = readFileSync(APP_PURCHASES, 'utf8');
  const match = source.match(/export const ENTITLEMENT_ID = '([^']+)'/);

  assert.ok(match, 'eddy-ios/src/lib/purchases.ts must export ENTITLEMENT_ID');
  assert.equal(
    match[1],
    DEFAULT_ENTITLEMENT_ID,
    `The Expo app uses "${match?.[1]}" and this backend uses "${DEFAULT_ENTITLEMENT_ID}". ` +
      'These must match each other AND the identifier in the RevenueCat dashboard, ' +
      'or entitlements are written that no query reads and the paywall never unlocks.',
  );
});

test('no route retypes the identifier as a literal', () => {
  // Every query must import DEFAULT_ENTITLEMENT_ID. A literal is how the copies
  // got out of step in the first place, and it is invisible in review because
  // the string looks obviously correct wherever you happen to be reading.
  const apiRoot = join(process.cwd(), 'src/app/api');
  const offenders: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) {
        const source = readFileSync(full, 'utf8');
        if (source.includes(`'${DEFAULT_ENTITLEMENT_ID}'`)) {
          offenders.push(full.slice(process.cwd().length + 1));
        }
      }
    }
  };
  walk(apiRoot);

  assert.deepEqual(
    offenders,
    [],
    `These routes hardcode the entitlement id instead of importing DEFAULT_ENTITLEMENT_ID: ${offenders.join(', ')}`,
  );
});

test('the column default matches the application constant', () => {
  // A default that disagrees with the constant is not a live bug — every insert
  // names the id — but it is a trap for the next query somebody writes against
  // this table by hand.
  const migrations = join(process.cwd(), 'supabase/migrations');
  const defaults = readdirSync(migrations)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .flatMap((f) => {
      const sql = readFileSync(join(migrations, f), 'utf8');
      return [...sql.matchAll(/entitlement_id\s+text\s+not\s+null\s+default\s+'([^']+)'/gi)]
        .concat([...sql.matchAll(/alter\s+column\s+entitlement_id\s+set\s+default\s+'([^']+)'/gi)])
        .map((m) => m[1]);
    });

  assert.ok(defaults.length > 0, 'expected at least one entitlement_id default in the migrations');
  assert.equal(
    defaults[defaults.length - 1],
    DEFAULT_ENTITLEMENT_ID,
    'the LAST migration to set entitlement_id\'s default must set it to the application constant',
  );
});
