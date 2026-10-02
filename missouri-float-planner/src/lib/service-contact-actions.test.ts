import assert from 'node:assert/strict';
import test from 'node:test';
import { serviceContactActions } from '../../../eddy-ios/src/lib/serviceContactActions';

test('phone, website and booking remain independently available', () => {
  assert.deepEqual(serviceContactActions({
    phone: '(573) 555-0123', website: 'example.com', reservationUrl: 'https://example.com/book',
  }), [
    { label: 'Call', url: 'tel:5735550123' },
    { label: 'Website', url: 'https://example.com' },
    { label: 'Book', url: 'https://example.com/book' },
  ]);
});

test('phone-only businesses need no booking URL', () => {
  assert.deepEqual(serviceContactActions({ phone: '+1 573 555 0123' }), [
    { label: 'Call', url: 'tel:+15735550123' },
  ]);
});

test('website-only and booking-only contacts work without a phone', () => {
  assert.deepEqual(serviceContactActions({ website: 'https://example.com' }), [
    { label: 'Website', url: 'https://example.com' },
  ]);
  assert.deepEqual(serviceContactActions({ reservationUrl: 'https://example.com/book' }), [
    { label: 'Book', url: 'https://example.com/book' },
  ]);
});

test('absent or invalid contact details produce no dead controls', () => {
  assert.deepEqual(serviceContactActions({}), []);
  assert.deepEqual(serviceContactActions({ phone: ' ', website: 'javascript:alert(1)', reservationUrl: 'https://' }), []);
});
