import test from 'node:test';
import assert from 'node:assert/strict';
import { slugForSave, slugFromName } from './access-point-slug';

const live = { name: "Mother Nature's Riverfront Retreat", slug: 'mother-nature-s-riverfront-retreat', approved: true };

test('a save that repeats the same name never moves the slug', () => {
  // The map editor sends the name with every save. This slug is not what the
  // name would derive today, so the old "rebuild on every save" would move it.
  assert.deepEqual(slugForSave({ ...live, slug: 'mother-natures-retreat' }, live.name), { keptLiveAddress: false });
  assert.deepEqual(slugForSave(live, `  ${live.name} `), { keptLiveAddress: false });
});

test('renaming a live point keeps its public address', () => {
  assert.deepEqual(slugForSave(live, 'Riverfront Retreat'), { keptLiveAddress: true });
});

test('renaming an unapproved point follows the new name', () => {
  assert.deepEqual(slugForSave({ ...live, approved: false }, 'Riverfront Retreat'), {
    slug: 'riverfront-retreat',
    keptLiveAddress: false,
  });
  // A name with nothing sluggable leaves the slug alone rather than blanking it.
  assert.deepEqual(slugForSave({ ...live, approved: false }, '!!!'), { keptLiveAddress: false });
});

test('slugFromName matches the route’s original rule', () => {
  assert.equal(slugFromName("Ha Ha Tonka State Park "), 'ha-ha-tonka-state-park');
});
