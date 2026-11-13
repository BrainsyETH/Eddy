import assert from 'node:assert/strict';
import test from 'node:test';
import { accessNoteItems, campingServiceGroups, campgroundThumbnailUrl } from '../../../eddy-ios/src/components/map-sheet/overviewDetails';
import { withLinkedServices } from './access-points/linked-services';

test('notes become readable points without dropping restrictions or rewriting advice', () => {
  const text = 'Reserve ahead for summer weekends. Creek Loop is closest to the water; Pines Overlook is more secluded but non-electric. Dogs on a 6-ft leash. Dead and downed firewood only. No fireworks.';
  const items = accessNoteItems(text);
  assert.equal(items.length, 5);
  assert.equal(items.join(' '), text);
  assert.equal(items.at(-2), 'Dead and downed firewood only.');
});

test('authored HTML lists, paragraphs and encoded text remain readable', () => {
  assert.deepEqual(accessNoteItems('<p>Keep the ramp clear.</p><ul><li>Dogs &amp; children stay close.</li><li>No fireworks.</li></ul>'), [
    'Keep the ramp clear.', 'Dogs & children stay close.', 'No fireworks.',
  ]);
  assert.deepEqual(accessNoteItems(null), []);
  assert.deepEqual(accessNoteItems('<p> </p>'), []);
});

test('reading breaks preserve decimals, URLs, abbreviations and initials', () => {
  assert.deepEqual(accessNoteItems('U.S. Forest Service rules apply. St. Louis is 1.5 hours away. See Recreation.gov. No fireworks.'), [
    'U.S. Forest Service rules apply.', 'St. Louis is 1.5 hours away.', 'See Recreation.gov.', 'No fireworks.',
  ]);
});

test('only a verified same-place relationship labels a campground as here', () => {
  const groups = campingServiceGroups([
    { name: 'Same name as this access', type: 'campground', distance: '0 mi' },
    { name: 'Same facility, different arrival', type: 'campground', relationship: 'located_at' },
    { name: 'Verified campground', type: 'campground', relationship: 'same_place' },
  ]);
  assert.deepEqual(groups.here.map(s => s.name), ['Verified campground']);
  assert.equal(groups.nearby.length, 2);
});

test('the API merge carries verified identity without assigning it to legacy entries', () => {
  const services = withLinkedServices(
    [{ name: 'Nearby campground', type: 'campground' }],
    [{ id: 'camp', name: 'On-site campground', type: 'campground', phone: null, website: null,
      reservationUrl: null, description: null, relationship: 'same_place' }],
  );
  assert.equal(services[0].relationship, 'same_place');
  assert.equal(services[1].relationship, undefined);
});

test('unknown relationships cannot claim on-site camping', () => {
  const [service] = withLinkedServices([], [{ id: 'camp', name: 'Camp', type: 'campground',
    phone: null, website: null, reservationUrl: null, description: null, relationship: 'nearby' }]);
  assert.equal(service.relationship, undefined);
});

test('campground thumbnails use their own photo and share access photos only for verified same-place links', () => {
  const campground = { name: 'Camp', type: 'campground' as const };
  const accessPhoto = 'https://example.com/access.jpg';
  const ownPhoto = 'https://example.com/campground.jpg';
  assert.equal(campgroundThumbnailUrl(campground, accessPhoto), null);
  assert.equal(campgroundThumbnailUrl({ ...campground, relationship: 'located_at' }, accessPhoto), null);
  assert.equal(campgroundThumbnailUrl({ ...campground, relationship: 'same_place' }, accessPhoto), accessPhoto);
  assert.equal(campgroundThumbnailUrl({ ...campground, relationship: 'same_place', imageUrl: ownPhoto }, accessPhoto), ownPhoto);
  assert.equal(campgroundThumbnailUrl({ ...campground, imageUrl: ownPhoto }, accessPhoto), ownPhoto);
  assert.equal(campgroundThumbnailUrl({ ...campground, relationship: 'same_place' }), null);
});
