import assert from 'node:assert/strict';
import test from 'node:test';
import { hasValidMachineBearer } from './machine-auth';

test('machine authentication fails closed without a configured secret', () => {
  assert.equal(hasValidMachineBearer(null, undefined), false);
  assert.equal(hasValidMachineBearer('Bearer anything', undefined), false);
});

test('machine authentication rejects malformed and incorrect bearer values', () => {
  assert.equal(hasValidMachineBearer('secret', 'secret'), false);
  assert.equal(hasValidMachineBearer('Bearer wrong', 'secret'), false);
});

test('machine authentication accepts the exact bearer value', () => {
  assert.equal(hasValidMachineBearer('Bearer secret', 'secret'), true);
});
