import assert from 'node:assert/strict';
import test from 'node:test';
import { serviceContactActions } from '../../../eddy-ios/src/lib/serviceContactActions';
import { createExternalLinkOpener } from '../../../eddy-ios/src/lib/externalLinkOpener';

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

test('scheme-less service websites produce working normalized browser destinations', async () => {
  const opened: string[] = [];
  const open = createExternalLinkOpener({
    openBrowser: async (url) => { opened.push(url); },
    openSystem: async () => { assert.fail('Website should use the in-app browser'); },
    onError: () => { assert.fail('Valid service website should open'); },
  });
  for (const website of ['www.example.com', ' example.com/book a float?date=2026-10-12 ']) {
    const action = serviceContactActions({ website }).find(item => item.label === 'Website');
    assert.ok(action);
    await open(action.url);
  }
  assert.deepEqual(opened, ['https://www.example.com/', 'https://example.com/book%20a%20float?date=2026-10-12']);
});
