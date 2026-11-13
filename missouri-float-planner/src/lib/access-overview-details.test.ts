import assert from 'node:assert/strict';
import test from 'node:test';
import { accessNoteItems, campingServiceGroups, campgroundThumbnailUrl, visibleNearbyServices } from '../../../eddy-ios/src/components/map-sheet/overviewDetails';
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

test('lodging needs a usable destination, while informative camping entries remain visible', () => {
  const visible = visibleNearbyServices([
    { name: 'Bourbon', type: 'lodging', distance: '10 miles north', notes: 'Small community on I-44. Gas, basic supplies.' },
    { name: 'Invalid contacts', type: 'lodging', phone: 'unavailable', website: 'javascript:alert(1)' },
    { name: 'Phone lodge', type: 'lodging', phone: '573-555-0100' },
    { name: 'Web lodge', type: 'lodging', website: 'https://example.com/lodge' },
    { name: 'Bookable cabins', type: 'lodging', reservationUrl: 'https://example.com/reserve' },
    { name: 'Primitive camp', type: 'campground', notes: 'First-come sites.' },
  ]);
  assert.deepEqual(visible.map(service => service.name), ['Phone lodge', 'Web lodge', 'Bookable cabins', 'Primitive camp']);
});

test('verified booking links survive the API merge and qualify a lodging listing', () => {
  const services = withLinkedServices([], [{ id: 'lodge', name: 'Cabins', type: 'cabin_lodge',
    phone: null, website: null, description: null, relationship: 'located_at', reservationUrl: 'https://example.com/book' }]);
  assert.equal(services[0].reservationUrl, 'https://example.com/book');
  assert.equal(visibleNearbyServices(services as Parameters<typeof visibleNearbyServices>[0]).length, 1);
});
