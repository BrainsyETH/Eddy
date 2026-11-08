import assert from 'node:assert/strict';
import test from 'node:test';
import { USACE_DAMS, type UsaceDam } from './flow-providers/usace-registry';
import { DAM_PAGE_COPY, damAboutSentences, damPageCopy } from './dam-page-copy';

const dams = Object.values(USACE_DAMS);

const hasPostedSchedule = (dam: UsaceDam) => Boolean(dam.swpaCode) && dam.amerenMetrics !== 'osage';
// Stockton publishes nothing to CWMS and is not an Ameren-fed dam, so its page
// has no lake level to promise.
const hasPoolReading = (dam: UsaceDam) => Boolean(dam.series.poolElevation || dam.office || dam.amerenMetrics);

test('every registry dam has hand-written page copy, and no copy outlives its dam', () => {
  assert.deepEqual(Object.keys(DAM_PAGE_COPY).toSorted(), Object.keys(USACE_DAMS).toSorted());
});

test('dam titles and descriptions fit search results and are distinct', () => {
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const dam of dams) {
    const { title, description } = damPageCopy(dam);
    // The root template appends " | Eddy"; 60 + 7 stays inside the ~600px
    // Google renders before truncating.
    assert.ok(title.length <= 60, `${dam.id} title is ${title.length} chars: ${title}`);
    assert.ok(!/eddy/i.test(title), `${dam.id} title repeats the brand the template adds`);
    assert.ok(description.length >= 100 && description.length <= 160, `${dam.id} description is ${description.length} chars`);
    assert.ok(!titles.has(title), `${dam.id} reuses a title`);
    assert.ok(!descriptions.has(description), `${dam.id} reuses a description`);
    titles.add(title);
    descriptions.add(description);
  }
});

test('each title names its own dam', () => {
  for (const dam of dams) {
    const words = dam.name.replace(/\s+(Lock & Dam|Dam|Lake)$/, '').split(' ');
    const { title } = damPageCopy(dam);
    assert.ok(title.includes(words[0]) || title.includes(words.at(-1)!), `${dam.id}: "${title}" does not name ${dam.name}`);
  }
});

test('titles and descriptions promise only what the dam page can show', () => {
  for (const dam of dams) {
    const { title, description } = damPageCopy(dam);
    const copy = `${title} ${description}`;
    if (/schedule/i.test(copy)) assert.ok(hasPostedSchedule(dam), `${dam.id} promises a schedule SWPA does not post`);
    if (hasPostedSchedule(dam)) assert.match(copy, /schedule/i, `${dam.id} hides its hourly schedule`);
    if (/forecast/i.test(copy)) assert.ok(!hasPostedSchedule(dam) && dam.office === 'LRN', `${dam.id} promises a generation forecast`);
    if (/level/i.test(copy)) assert.ok(hasPoolReading(dam), `${dam.id} promises a lake level it has no reading for`);
    if (!hasPoolReading(dam)) assert.doesNotMatch(copy, /level/i);
  }
});

test('a dam missing from the copy table still gets honest metadata', () => {
  const stockton = USACE_DAMS['nwk-stockton-dam'];
  const unlisted = { ...stockton, id: 'test-unlisted-dam', name: 'Example Dam', lakeName: 'Example Lake' };
  assert.equal(damPageCopy(unlisted).title, 'Example Dam Generation Schedule');
  const gated = { ...USACE_DAMS['swl-clearwater-dam'], id: 'test-gated-dam', name: 'Gate Dam' };
  assert.equal(damPageCopy(gated).title, 'Gate Dam Release & Lake Level');
});

test('About text is built from registry facts and names the water below', () => {
  assert.deepEqual(damAboutSentences(USACE_DAMS['swl-table-rock-dam']), [
    'Table Rock Dam impounds Table Rock Lake in Missouri and is operated by the U.S. Army Corps of Engineers.',
    'Its powerhouse has 4 generating units rated at 200 MW, and the Southwestern Power Administration posts its hourly generation schedule.',
    'Water released here flows into Lake Taneycomo, a cold-water trout fishery.',
  ]);
  assert.match(damAboutSentences(USACE_DAMS['nwk-stockton-dam'])[1], /1 generating unit rated/);
  assert.match(damAboutSentences(USACE_DAMS['swl-clearwater-dam'])[1], /no powerhouse/);
  const bagnell = damAboutSentences(USACE_DAMS['ameren-bagnell-dam']);
  assert.match(bagnell[0], /operated by Ameren Missouri/);
  assert.doesNotMatch(bagnell.join(' '), /Southwestern Power/);
  assert.equal(damAboutSentences(USACE_DAMS['mvs-wappapello'])[0], 'Wappapello Lake is a reservoir in Missouri operated by the U.S. Army Corps of Engineers.');
});
