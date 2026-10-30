import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createElement } from 'react';
import sharp from 'sharp';
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompletedFloat, StartCondition } from './float-archive';
import { renderToStaticMarkup } from 'react-dom/server';
import { CONDITION_SYSTEM } from './condition-system';
import { exploredPercent } from './float-recap';
import { floatImagePath, floatShareState, localDay, MAX_SHARE_MINUTES, parseFloatShare, shareDuration, shareMood, type FloatShareState } from './float-share';
import { FLOAT_MOOD_STICKERS, STANDARD_OTTER, stickerDataUrl } from '../src/lib/float-share/sticker';
import { loadFloatShareNames } from '../src/lib/float-share/names';
import { FLOAT_SHARE_HEIGHT, FLOAT_SHARE_WIDTH, FloatShareImage, stampInk } from '../src/lib/og/float-share-image';
import { respondFloatShare } from '../src/lib/float-share/respond';
import { loadOgFonts } from '../src/lib/og/fonts';
import { GET } from '../src/app/api/share/float/image/route';

const START = Date.parse('2026-10-26T15:00:00Z');
const NOW = Date.parse('2026-10-30T12:00:00Z');
const HOUR = 3_600_000;

function trip(overrides: Partial<CompletedFloat> = {}): CompletedFloat {
  return {
    version: 1, id: 'float-1', riverSlug: 'current', riverName: 'Current River',
    putInId: 'akers', putInName: 'Akers Ferry', takeOutId: 'pulltite', takeOutName: 'Pulltite', boatType: 'kayak',
    startNote: 'Recording started 3.2 mi below Akers',
    startedAt: START, endedAt: START + 4.2 * HOUR, elapsedMs: 4.2 * HOUR,
    movingMs: 2.6 * HOUR, stoppedMs: 1.4 * HOUR, unknownMs: 0.2 * HOUR,
    distanceMiles: 9.83, movingMph: 2.3, plannerMph: 2.3, firstMile: 52.1, lastMile: 61.9,
    reachedTakeOut: true, measurementVersion: 1,
    riverSpan: { firstMile: 0, lastMile: 134, firstName: 'Baptist Camp', lastName: 'Big Spring' },
    coveredMiles: [[52.1, 61.9]],
    ...overrides,
  };
}
const flowing: StartCondition = {
  code: 'flowing', gaugeName: 'Current River at Akers', usgsSiteId: '07064533', heightFt: 2.1,
  dischargeCfs: 412.4, observedAt: new Date(START - 6 * 60_000).toISOString(), accuracyWarning: false,
};
const params = (path: string) => new URL(path, 'https://eddy.guide').searchParams;

test('a float becomes one canonical share and parses back to itself', () => {
  const state = floatShareState(trip({ startCondition: flowing }));
  assert.deepEqual(state, {
    version: 1, riverSlug: 'current', putInId: 'akers', takeOutId: 'pulltite', date: localDay(START),
    tracking: 'measured', reachedTakeOut: true, mood: 'made-it',
    condition: { code: 'flowing', current: true, cfs: 412 },
    miles: 9.8, minutes: 252, explored: { miles: 9.8, percent: 7 },
  });
  const path = floatImagePath(state);
  assert.equal(path, `/api/share/float/image?v=1&river=current&from=akers&to=pulltite&date=${localDay(START)}&tracking=measured&reached=1&mood=made-it&cond=flowing&cur=1&cfs=412&mi=9.8&min=252&exp=9.80&pct=7`);
  assert.deepEqual(parseFloatShare(params(path), NOW), state);
  const untracked = floatShareState(trip({ firstMile: null, lastMile: null, distanceMiles: 0, coveredMiles: [], putInId: null, putInName: null }));
  assert.deepEqual(parseFloatShare(params(floatImagePath(untracked)), NOW), untracked);
});

test('a share never carries the time of day, the note, positions or names', () => {
  const path = floatImagePath(floatShareState(trip({ startCondition: flowing })));
  for (const leak of ['Recording', 'Akers Ferry', 'Pulltite', 'Current River', 'T15', ':00', 'lat', 'lng', 'note', 'float-1']) {
    assert.ok(!path.includes(leak), leak);
  }
});

test('malformed or inconsistent shares are refused, never drawn', () => {
  const good = floatImagePath(floatShareState(trip({ startCondition: flowing })));
  const variant = (edit: (q: URLSearchParams) => void) => {
    const q = params(good);
    edit(q);
    return parseFloatShare(q, NOW);
  };
  assert.ok(variant(() => {}));
  const refused: [string, (q: URLSearchParams) => void][] = [
    ['unknown key', (q) => q.set('name', 'Anything')],
    ['repeated key', (q) => q.append('river', 'current')],
    ['wrong version', (q) => q.set('v', '2')],
    ['bad slug', (q) => q.set('river', 'Current River')],
    ['impossible date', (q) => q.set('date', '2026-02-30')],
    ['future date', (q) => q.set('date', '2027-01-01')],
    ['untracked with a distance', (q) => q.set('tracking', 'none')],
    ['exp without pct', (q) => q.delete('pct')],
    ['a percent over 100', (q) => q.set('pct', '101')],
    ['a fractional percent', (q) => q.set('pct', '7.5')],
    ['nothing explored', (q) => q.set('exp', '0.00')],
    ['over thirty days', (q) => q.set('min', String(MAX_SHARE_MINUTES + 1))],
    ['unknown condition', (q) => q.set('cond', 'purple')],
    ['cur without cond', (q) => { q.delete('cond'); q.delete('cfs'); }],
    ['big water on flowing water', (q) => q.set('mood', 'big-water')],
    ['scrape on flowing water', (q) => q.set('mood', 'scrape')],
    ['big water on a stale high', (q) => { q.set('cond', 'high'); q.set('cur', '0'); q.set('mood', 'big-water'); }],
    ['a fraction of a minute', (q) => q.set('min', '12.5')],
    ['a huge distance', (q) => q.set('mi', '9999.0')],
  ];
  for (const [label, edit] of refused) assert.equal(variant(edit), null, label);
  const none = params(floatImagePath(floatShareState(trip({ firstMile: null, lastMile: null, distanceMiles: 0, coveredMiles: [] }))));
  none.set('mood', 'made-it');
  assert.equal(parseFloatShare(none, NOW), null, 'an untracked float has no mood to send');
});

test('the server draws the recap otter: nothing measured is the standard otter, even at Flood', () => {
  const base: FloatShareState = floatShareState(trip({ startCondition: flowing }));
  const high = { code: 'dangerous' as const, current: true, cfs: 9000 };
  assert.equal(shareMood({ ...base, tracking: 'none', miles: null, explored: null, mood: null, condition: high }), null);
  assert.equal(shareMood({ ...base, tracking: 'partial', mood: 'big-water', condition: high }), 'big-water');
  assert.equal(shareMood({ ...base, mood: 'made-it', condition: { ...high, current: false } }), null, 'a stale high never celebrates');
  assert.equal(shareMood({ ...base, mood: 'made-it', condition: high }), 'big-water', 'whatever the query sent');
  assert.equal(shareMood(base), 'made-it');
  assert.equal(shareDuration(252), '4 hr 12 min');
  assert.equal(shareDuration(0), '<1 min');
});

test('the server stickers are the app stickers', async () => {
  const otter = readFileSync('../eddy-ios/src/components/Otter.tsx', 'utf8');
  for (const [mood, file] of Object.entries(FLOAT_MOOD_STICKERS)) {
    const name = file.replace('icons/', '');
    assert.match(otter, new RegExp(`'?${mood}'?: require\\('../../assets/eddy/${name.replace('.', '\\.')}'\\)`), mood);
  }
  const pixels = (path: string) => sharp(readFileSync(path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const [web, app] = await Promise.all([pixels(`public/${STANDARD_OTTER}`), pixels('../eddy-ios/assets/otter/standard.png')]);
  assert.deepEqual(web.info, app.info);
  assert.ok(web.data.equals(app.data), 'public/share/otter-standard.png differs from the app’s standard otter');
});

/** Just enough of a PostgREST client for the name lookup. */
function namesDb(tables: Record<string, unknown>, fail = false) {
  return {
    from(table: string) {
      const answer = { data: tables[table] ?? null, error: fail ? { message: 'down' } : null };
      const chain = {
        select: () => chain, eq: () => chain, in: () => chain,
        maybeSingle: async () => answer,
        then: (resolve: (v: typeof answer) => unknown) => Promise.resolve(answer).then(resolve),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

test('names come from ids, only for approved access points on that river', async () => {
  const state = floatShareState(trip());
  const river = { id: 'r1', name: 'Current River', slug: 'current', state: 'MO' };
  const points = [
    { id: 'akers', name: 'Akers Ferry', river_id: 'r1', approved: true },
    { id: 'pulltite', name: 'Pulltite', river_id: 'r1', approved: true },
  ];
  assert.deepEqual(await loadFloatShareNames(namesDb({ rivers: river, access_points: points }), state), {
    riverName: 'Current River', riverPath: '/rivers/missouri/current', putInName: 'Akers Ferry', takeOutName: 'Pulltite',
  });
  assert.equal(await loadFloatShareNames(namesDb({ rivers: river, access_points: [points[1], { ...points[0], river_id: 'r2' }] }), state), null, 'another river’s access point');
  assert.equal(await loadFloatShareNames(namesDb({ rivers: river, access_points: [points[0], { ...points[1], approved: false }] }), state), null, 'unapproved');
  assert.equal(await loadFloatShareNames(namesDb({ rivers: null, access_points: points }), state), null);
  await assert.rejects(loadFloatShareNames(namesDb({}, true), state), /Could not read/);
});

test('the route refuses bad shares with an error and normalises spellings, before any lookup', async () => {
  const bad = await GET(new NextRequest('https://eddy.guide/api/share/float/image?v=1&river=current&to=x&date=2026-10-26&tracking=none&reached=1&min=5&mi=1.0'));
  assert.equal(bad.status, 400);
  assert.match(bad.headers.get('content-type') ?? '', /json/, 'never a picture');
  const path = floatImagePath(floatShareState(trip({ startCondition: flowing })));
  const shuffled = `/api/share/float/image?${[...params(path).entries()].reverse().map(([k, v]) => `${k}=${v}`).join('&')}`;
  const redirect = await GET(new NextRequest(`https://eddy.guide${shuffled}`));
  assert.equal(redirect.status, 308);
  assert.equal(new URL(redirect.headers.get('location')!).search, new URL(path, 'https://eddy.guide').search);
});

test('the image renders at 9:16 with the mood sticker', async () => {
  const state = floatShareState(trip({ startCondition: flowing }));
  const names = { riverName: 'Current River', riverPath: '/rivers/missouri/current', putInName: 'Akers Ferry', takeOutName: 'Pulltite' };
  const image = new ImageResponse(
    createElement(FloatShareImage, { state, names, mood: shareMood(state), sticker: await stickerDataUrl(shareMood(state)) }),
    { width: FLOAT_SHARE_WIDTH, height: FLOAT_SHARE_HEIGHT, fonts: loadOgFonts() },
  );
  const bytes = Buffer.from(await image.arrayBuffer());
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  assert.equal(bytes.readUInt32BE(16), 1080);
  assert.equal(bytes.readUInt32BE(20), 1920);
  if (process.env.FLOAT_SHARE_PREVIEW) writeFileSync(process.env.FLOAT_SHARE_PREVIEW, bytes);
});

test('a multi-day float can be shared: recordings have no length limit', () => {
  const twoDays = floatShareState(trip({ elapsedMs: 49 * HOUR, endedAt: START + 49 * HOUR, unknownMs: 46.4 * HOUR }));
  assert.equal(twoDays.minutes, 49 * 60);
  assert.deepEqual(parseFloatShare(params(floatImagePath(twoDays)), NOW), twoDays);
  const month = { ...twoDays, minutes: MAX_SHARE_MINUTES };
  assert.deepEqual(parseFloatShare(params(floatImagePath(month)), NOW), month, 'thirty days is the bound, not 48 hours');
});

test('the image states the percent the recap states, never one recomputed from rounded miles', () => {
  const span = (lastMile: number) => ({ firstMile: 0, lastMile, firstName: 'Top', lastName: 'Bottom' });
  for (const [explored, length, recap] of [[6.0, 6.04, '99%'], [6.06, 6.06, '100%'], [0.004, 134, 'Under 1%']] as const) {
    const t = trip({ riverSpan: span(length), coveredMiles: [[0, explored]] });
    const state = floatShareState(t);
    const parsed = parseFloatShare(params(floatImagePath(state)), NOW)!;
    const fraction = Math.min(1, explored / length);
    assert.equal(exploredPercent(fraction), recap, `recap for ${explored}/${length}`);
    const html = renderToStaticMarkup(createElement(FloatShareImage, {
      state: parsed, names: { riverName: 'Current River', riverPath: '/rivers/missouri/current', putInName: 'A', takeOutName: 'B' }, mood: null, sticker: '',
    }));
    assert.ok(html.includes(`${recap} of the Current’s float miles`), `image for ${explored}/${length}: ${recap}`);
  }
  const sliver = floatShareState(trip({ riverSpan: span(134), coveredMiles: [[10, 10.004]] }));
  assert.equal(sliver.explored?.miles, 0.01, 'a sliver encodes as 0.01, which reads "Under 0.1"');
});

test('under a minute reads "<1 min" on the image, as in the recap', () => {
  const quick = floatShareState(trip({ elapsedMs: 45_000, endedAt: START + 45_000, movingMs: 45_000, stoppedMs: 0, unknownMs: 0 }));
  assert.equal(quick.minutes, 0);
  assert.equal(shareDuration(quick.minutes), '<1 min');
  assert.equal(floatShareState(trip({ elapsedMs: 90_000, endedAt: START + 90_000, movingMs: 90_000, stoppedMs: 0, unknownMs: 0 })).minutes, 2);
});

test('a partly tracked float says so on the image, as on its card', () => {
  const names = { riverName: 'Current River', riverPath: '/rivers/missouri/current', putInName: 'Akers Ferry', takeOutName: 'Pulltite' };
  const draw = (t: CompletedFloat) => {
    const state = floatShareState(t);
    return renderToStaticMarkup(createElement(FloatShareImage, { state, names, mood: shareMood(state), sticker: '' }));
  };
  const partial = draw(trip({ movingMs: 0.8 * HOUR, stoppedMs: 0.2 * HOUR, unknownMs: 3.2 * HOUR }));
  assert.ok(partial.includes('miles paddled') && partial.includes('Limited GPS tracking'));
  assert.ok(!draw(trip()).includes('Limited GPS tracking'));
  assert.ok(draw(trip({ firstMile: null, lastMile: null, distanceMiles: 0, coveredMiles: [] })).includes('GPS distance unavailable'));
});

test('every condition stamp reads clearly on the teal', () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const teal = '#163F4A';
  assert.ok(contrast(CONDITION_SYSTEM.too_low.solid, teal) < 3, 'the raw Too Low colour was the problem');
  for (const code of ['too_low', 'low', 'good', 'flowing', 'high', 'dangerous'] as const) {
    assert.ok(contrast(stampInk(CONDITION_SYSTEM[code].solid), teal) >= 4.5, code);
  }
});

test('the route: 400 for a malformed share, 422 only when its places are gone, the PNG and link otherwise', async () => {
  const path = floatImagePath(floatShareState(trip({ startCondition: flowing })));
  const request = (p: string) => new NextRequest(`https://eddy.guide${p}`);
  const names = { riverName: 'Current River', riverPath: '/rivers/missouri/current', putInName: 'Akers Ferry', takeOutName: 'Pulltite' };
  let looked = 0;
  const deps = (found: typeof names | null) => ({
    limit: async () => null,
    names: async () => { looked += 1; return found; },
  });
  const malformed = await respondFloatShare(request(path.replace('min=252', 'min=abc')), deps(names));
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, 'invalid_share');
  assert.equal(looked, 0, 'a malformed share never reaches the lookup');
  const gone = await respondFloatShare(request(path), deps(null));
  assert.equal(gone.status, 422);
  assert.equal((await gone.json()).code, 'places_unavailable');
  const ok = await respondFloatShare(request(path), deps(names));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'image/png');
  assert.equal(ok.headers.get('x-eddy-share-path'), '/rivers/missouri/current');
});

test('high water is stated on the image, not celebrated', () => {
  const names = { riverName: 'Current River', riverPath: '/rivers/missouri/current', putInName: 'Akers Ferry', takeOutName: 'Pulltite' };
  const draw = (t: CompletedFloat) => {
    const state = floatShareState(t);
    return renderToStaticMarkup(createElement(FloatShareImage, { state, names, mood: shareMood(state), sticker: '' }));
  };
  // The colour of the element holding the mood line itself, not the wordmark.
  const labelColor = (html: string, text: string) => new RegExp(`color:([^;"]+)[^>]*>${text}<`).exec(html)?.[1];
  assert.equal(labelColor(draw(trip({ startCondition: { ...flowing, code: 'dangerous' } })), 'Flood stage'), 'rgba(250,250,250,0.72)');
  assert.equal(labelColor(draw(trip({ startCondition: { ...flowing, code: 'high' } })), 'Big water'), 'rgba(250,250,250,0.72)');
  assert.equal(labelColor(draw(trip({ startCondition: flowing })), 'Made it!'), '#F07052', 'Made it! keeps its coral');
});
