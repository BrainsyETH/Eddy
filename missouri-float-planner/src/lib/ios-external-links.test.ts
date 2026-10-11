import assert from 'node:assert/strict';
import test from 'node:test';
import { createExternalLinkOpener } from '../../../eddy-ios/src/lib/externalLinkOpener';

function harness() {
  const browser: string[] = [];
  const system: string[] = [];
  const errors: unknown[] = [];
  const handlers = {
    openBrowser: async (url: string): Promise<unknown> => browser.push(url),
    openSystem: async (url: string): Promise<unknown> => system.push(url),
    onError: (error: unknown) => { errors.push(error); },
  };
  return { browser, system, errors, handlers };
}

test('guides, reservations and source pages open in the browser with the complete URL', async () => {
  const h = harness();
  const open = createExternalLinkOpener(h.handlers);
  const urls = [
    'https://eddy.guide/blog/current-river-guide',
    'https://www.recreation.gov/camping/campsites/123?start=2026-10-12&end=2026-10-14#details',
    'https://waterdata.usgs.gov/monitoring-location/07068000/',
    'http://example.com/outfitter',
  ];
  for (const url of urls) await open(url);
  assert.deepEqual(h.browser, urls);
  assert.deepEqual(h.system, []);
  assert.deepEqual(h.errors, []);
});

test('mixed contact rows hand telephone, email and app schemes to the system', async () => {
  const h = harness();
  const open = createExternalLinkOpener(h.handlers);
  const urls = ['tel:+15551234567', 'mailto:support@eddy.guide', 'sms:+15551234567', 'comgooglemaps://?daddr=37,-91'];
  for (const url of urls) await open(url);
  assert.deepEqual(h.system, urls);
  assert.deepEqual(h.browser, []);
  assert.deepEqual(h.errors, []);
});

test('unavailable in-app browser falls back to the same URL in the system browser', async () => {
  const h = harness();
  h.handlers.openBrowser = async () => { throw new Error('Missing native module'); };
  const open = createExternalLinkOpener(h.handlers);
  const url = 'https://www.recreation.gov/camping/campgrounds/123?tab=campsites';
  await open(url);
  assert.deepEqual(h.system, [url]);
  assert.deepEqual(h.errors, []);
});

test('two failed opens show one error and release the guard so the user can retry', async () => {
  const h = harness();
  const unavailable = new Error('Cannot open URL');
  let fails = true;
  h.handlers.openBrowser = async (url) => {
    if (fails) throw unavailable;
    h.browser.push(url);
  };
  h.handlers.openSystem = async () => { throw unavailable; };
  const open = createExternalLinkOpener(h.handlers);
  await open('https://example.com');
  assert.deepEqual(h.errors, [unavailable]);
  fails = false;
  await open('https://example.com');
  assert.deepEqual(h.browser, ['https://example.com/']);
  assert.equal(h.errors.length, 1);
});

test('booking callers can keep their inline error without also showing the default alert', async () => {
  const h = harness();
  const unavailable = new Error('Cannot open URL');
  h.handlers.openBrowser = h.handlers.openSystem = async () => { throw unavailable; };
  const open = createExternalLinkOpener(h.handlers);
  const inlineErrors: unknown[] = [];
  await open('https://example.com', (error) => inlineErrors.push(error));
  assert.deepEqual(inlineErrors, [unavailable]);
  assert.deepEqual(h.errors, []);
  await open('tel:+15551234567');
  assert.deepEqual(h.errors, [unavailable]);
});

test('duplicate taps across callers do not stack sheets or release the active browser guard', async () => {
  const h = harness();
  let dismiss!: () => void;
  h.handlers.openBrowser = (url) => {
    h.browser.push(url);
    return new Promise<void>((resolve) => { dismiss = resolve; });
  };
  const open = createExternalLinkOpener(h.handlers);
  const first = open('https://example.com/first');
  await open('https://example.com/first');
  await open('https://example.com/second');
  assert.deepEqual(h.browser, ['https://example.com/first']);
  // Contact actions never get stuck behind an active web sheet.
  await open('tel:+15551234567');
  assert.deepEqual(h.system, ['tel:+15551234567']);
  dismiss();
  await first;
  const second = open('https://example.com/second');
  assert.deepEqual(h.browser, ['https://example.com/first', 'https://example.com/second']);
  dismiss();
  await second;
  assert.deepEqual(h.errors, []);
});

test('invalid URLs report a failure without opening anything; surrounding whitespace is tolerated', async () => {
  const h = harness();
  const open = createExternalLinkOpener(h.handlers);
  await open('not a URL');
  assert.equal(h.errors.length, 1);
  assert.deepEqual(h.browser, []);
  assert.deepEqual(h.system, []);
  await open('  https://example.com  ');
  assert.deepEqual(h.browser, ['https://example.com/']);
});

test('web browser and fallback receive the parsed URL, including encoded spaces and Unicode', async () => {
  const h = harness();
  const attempted: string[] = [];
  h.handlers.openBrowser = async (url) => { attempted.push(url); throw new Error('Cannot present'); };
  const open = createExternalLinkOpener(h.handlers);
  const input = ' HTTPS://EXAMPLE.COM:443/café guide?name=Big Spring#the map ';
  const expected = 'https://example.com/caf%C3%A9%20guide?name=Big%20Spring#the%20map';
  await open(input);
  assert.deepEqual(attempted, [expected]);
  assert.deepEqual(h.system, [expected]);
});

test('a supported Recreation.gov booking opens its app without presenting either browser', async () => {
  const h = harness();
  const app: string[] = [];
  const open = createExternalLinkOpener({ ...h.handlers, openBookingApp: async (url) => { app.push(url); return true; } });
  const urls = [
    'https://www.recreation.gov/camping/campsites/123?start=2026-10-12&end=2026-10-14#details',
    'https://recreation.gov/camping/campgrounds/234/',
  ];
  for (const url of urls) await open(url);
  assert.deepEqual(app, urls);
  assert.deepEqual(h.browser, []);
  assert.deepEqual(h.system, []);
});

test('no installed app, an unhandled URL or a missing native module all use the in-app browser', async () => {
  const url = 'https://www.recreation.gov/camping/campsites/123';
  for (const outcome of ['unhandled', 'missing-module'] as const) {
    const h = harness();
    const open = createExternalLinkOpener({ ...h.handlers, openBookingApp: async () => {
      if (outcome === 'missing-module') throw new Error('Missing native module');
      return false;
    } });
    await open(url);
    assert.deepEqual(h.browser, [url]);
    assert.deepEqual(h.system, []);
    assert.deepEqual(h.errors, []);
  }
});

test('only exact HTTPS Recreation.gov booking URLs attempt an app handoff', async () => {
  const h = harness();
  const app: string[] = [];
  const open = createExternalLinkOpener({ ...h.handlers, openBookingApp: async (url) => { app.push(url); return true; } });
  const urls = [
    'https://www.recreation.gov/articles/story',
    'https://www.recreation.gov/camping/campsites',
    'https://www.recreation.gov/camping/campsites/123/other',
    'http://www.recreation.gov/camping/campsites/123',
    'https://www.recreation.gov.example.com/camping/campsites/123',
    'https://www.recreation.gov@evil.example/camping/campsites/123',
    'https://example.com@www.recreation.gov/camping/campsites/123',
    'https://www.recreation.gov:8443/camping/campsites/123',
    'https://eddy.guide/blog/current-river-guide',
    'https://icampmo.com/book',
  ];
  for (const url of urls) await open(url);
  assert.deepEqual(app, []);
  assert.deepEqual(h.browser, urls);
});

test('rapid booking taps share the guard while an app handoff is pending', async () => {
  const h = harness();
  let complete!: (opened: boolean) => void;
  const app: string[] = [];
  const open = createExternalLinkOpener({ ...h.handlers, openBookingApp: (url) => {
    app.push(url);
    return new Promise<boolean>(resolve => { complete = resolve; });
  } });
  const url = 'https://www.recreation.gov/camping/campsites/123';
  const first = open(url);
  await open(url);
  await open('https://example.com/while-pending');
  assert.deepEqual(app, [url]);
  assert.deepEqual(h.browser, []);
  complete(true);
  await first;
  await open('https://example.com/after-returning');
  assert.deepEqual(h.browser, ['https://example.com/after-returning']);
});

test('booking app failure still permits system-browser fallback and a later retry', async () => {
  const h = harness();
  h.handlers.openBrowser = async () => { throw new Error('Cannot present'); };
  const open = createExternalLinkOpener({ ...h.handlers, openBookingApp: async () => false });
  const url = 'https://www.recreation.gov/camping/campsites/123';
  await open(url);
  await open(url);
  assert.deepEqual(h.system, [url, url]);
  assert.deepEqual(h.errors, []);
});
