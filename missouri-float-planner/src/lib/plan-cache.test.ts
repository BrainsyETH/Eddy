import assert from 'node:assert/strict';
import test from 'node:test';
import type { FloatPlan } from '@/types/api';
import {
  LAST_VALID_PLAN_MAX_AGE_MS,
  readLastValidPlan,
  writeLastValidPlan,
  type PlanCacheIdentity,
} from './plan-cache';

class MemoryStorage {
  value: string | null = null;
  getItem() { return this.value; }
  setItem(_key: string, value: string) { this.value = value; }
}

const identity: PlanCacheIdentity = {
  riverId: 'river-1',
  startId: 'access-1',
  endId: 'access-2',
  vesselTypeId: 'canoe-1',
};

const plan = {
  river: { id: 'river-1' },
  putIn: { id: 'access-1', localTips: '<img src=x onerror=alert(1)>' },
  takeOut: { id: 'access-2', localTips: '<script>alert(1)</script>' },
  vessel: { id: 'canoe-1' },
  distance: { miles: 8.9 },
  condition: { code: 'good' },
} as FloatPlan;

test('last-valid plan round-trips only for the exact route identity', () => {
  const storage = new MemoryStorage();
  const saved = writeLastValidPlan(storage, identity, plan, 1_000);
  assert.equal(saved?.savedAt, 1_000);
  const restored = readLastValidPlan(storage, identity, 2_000)?.plan;
  assert.equal(restored?.river.id, plan.river.id);
  assert.equal(restored?.putIn.localTips, null);
  assert.equal(restored?.takeOut.localTips, null);
  assert.equal(
    readLastValidPlan(storage, { ...identity, endId: 'different-access' }, 2_000),
    null
  );
});

test('last-valid plan expires and rejects corrupt or mismatched payloads', () => {
  const storage = new MemoryStorage();
  writeLastValidPlan(storage, identity, plan, 1_000);
  assert.equal(
    readLastValidPlan(storage, identity, 1_000 + LAST_VALID_PLAN_MAX_AGE_MS + 1),
    null
  );

  storage.value = '{not-json';
  assert.equal(readLastValidPlan(storage, identity, 2_000), null);

  const wrongPlan = { ...plan, takeOut: { id: 'wrong-access' } } as FloatPlan;
  assert.equal(writeLastValidPlan(storage, identity, wrongPlan, 2_000), null);
});
