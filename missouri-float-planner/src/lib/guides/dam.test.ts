import assert from 'node:assert/strict';
import test from 'node:test';
import { guideDam } from './dam';

test('a guide shows a dam only for a tailwater river, and a schedule only for a powerhouse', () => {
  assert.deepEqual(guideDam('black'), { id: 'swl-clearwater-dam', name: 'Clearwater Dam', hydro: false });
  assert.equal(guideDam('white')?.hydro, true);
  assert.equal(guideDam('taneycomo')?.name, 'Table Rock Dam');
  assert.equal(guideDam('current'), null);
  assert.equal(guideDam(''), null);
});
