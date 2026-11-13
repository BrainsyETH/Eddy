import assert from 'node:assert/strict';
import test from 'node:test';
import { riverHeaderPhoto, riverTitleCollapsed, RIVER_TITLE_SHADE } from '../../../eddy-ios/src/lib/riverHeader';
import { RIVER_PHOTOS, RIVER_PHOTO_CREDITS } from '../../shared/river-photos';

test('cached Current River responses use the selected Montauk waterfall photo', () => {
  assert.equal(riverHeaderPhoto({ slug: 'current' })?.url,
    'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1770003451989-Montauk-9DBZH6CuKRaiCxQEd6sBa5MWkONotQ.png');
  assert.equal(riverHeaderPhoto(null), null);
  assert.equal(riverHeaderPhoto({ slug: 'no-photo' }), null);
});

test('photo overrides retain their own attribution, never another image’s credit', () => {
  const credit = { text: 'Photographer', url: 'https://example.com/source' };
  assert.deepEqual(riverHeaderPhoto({ slug: 'james', photoUrl: 'https://example.com/new.jpg', photoCredit: credit }),
    { url: 'https://example.com/new.jpg', credit });
  assert.equal(riverHeaderPhoto({ slug: 'james', photoUrl: 'https://example.com/new.jpg' })?.credit, null);
  assert.deepEqual(riverHeaderPhoto({ slug: 'james', photoUrl: RIVER_PHOTOS.james })?.credit, RIVER_PHOTO_CREDITS.james);
  assert.equal(riverHeaderPhoto({ slug: 'current', photoUrl: 'file:///private/photo.jpg' }), null);
});

test('compact title follows the measured title and adjusted scroll inset', () => {
  assert.equal(riverTitleCollapsed(null, 0, 100), false);
  assert.equal(riverTitleCollapsed(90, -100, 100), false); // iOS rest position
  assert.equal(riverTitleCollapsed(90, -11, 100), false);
  assert.equal(riverTitleCollapsed(90, -10, 100), true);
  assert.equal(riverTitleCollapsed(180, -10, 100), false); // wrapped / enlarged title
  assert.equal(riverTitleCollapsed(180, 80, 100), true);
  assert.equal(riverTitleCollapsed(90, Number.NaN, 100), false);
});

test('small white metadata meets 4.5:1 even over an entirely white photograph', () => {
  const channel = 1 - RIVER_TITLE_SHADE;
  const luminance = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  assert.ok(1.05 / (luminance + 0.05) >= 4.5);
});
