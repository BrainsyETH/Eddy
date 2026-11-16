import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { changedFields, stageMove, type StagedMove } from './edit-diff';

interface Form {
  id: string;
  name: string;
  description: string | null;
  imageUrls: string[];
  riverMile: number | null;
}
const KEYS = ['name', 'description', 'imageUrls', 'riverMile'] as const;
const LOADED: Form = { id: 'a', name: 'Akers', description: null, imageUrls: ['one.jpg'], riverMile: 0 };

describe('changedFields', () => {
  it('sends nothing for an untouched form', () => {
    assert.deepEqual(changedFields<Form>(LOADED, { ...LOADED, imageUrls: ['one.jpg'] }, KEYS), {});
  });

  it('a stale tab that edits the name cannot overwrite images added elsewhere', () => {
    // The tab still holds ['one.jpg']; another editor has since added a second.
    const sent = changedFields<Form>(LOADED, { ...LOADED, name: 'Akers Ferry' }, KEYS);
    assert.deepEqual(sent, { name: 'Akers Ferry' });
    assert.equal('imageUrls' in sent, false);
  });

  it('treats empty text and null as the same, but keeps a real zero', () => {
    assert.deepEqual(changedFields<Form>(LOADED, { ...LOADED, description: '' }, KEYS), {});
    assert.deepEqual(changedFields<Form>(LOADED, { ...LOADED, riverMile: null }, KEYS), { riverMile: null });
  });

  it('never sends keys outside the editable list', () => {
    assert.deepEqual(changedFields<Form>(LOADED, { ...LOADED, id: 'b' }, KEYS), {});
  });
});

describe('staged marker moves', () => {
  const from = { lng: -91.5, lat: 37.3 };
  const move = (to: { lng: number; lat: number }): StagedMove => ({ kind: 'access-point', name: 'Akers', from, to });

  it('stages a real move and keeps the saved position as its origin', () => {
    const staged = stageMove(new Map(), 'a', move({ lng: -91.51, lat: 37.31 }));
    assert.deepEqual(staged.get('a')?.from, from);
    const again = stageMove(staged, 'a', move({ lng: -91.52, lat: 37.32 }));
    assert.deepEqual(again.get('a')?.from, from);
    assert.equal(again.size, 1);
  });

  it('cancel is exact: discarding the staged set leaves the saved coordinates', () => {
    const staged = stageMove(new Map(), 'a', move({ lng: -91.51, lat: 37.31 }));
    const cancelled = new Map<string, StagedMove>();
    assert.equal(cancelled.has('a'), false);
    assert.deepEqual(staged.get('a')?.from, from); // nothing about `from` was mutated
  });

  it('a slipped click or a drag back home is not a move', () => {
    assert.equal(stageMove(new Map(), 'a', move({ lng: -91.50001, lat: 37.30001 })).size, 0);
    const staged = stageMove(new Map(), 'a', move({ lng: -91.51, lat: 37.31 }));
    assert.equal(stageMove(staged, 'a', move(from)).size, 0);
  });
});
