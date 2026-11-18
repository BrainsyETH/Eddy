import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkRead, flatForecasts, measurementsIn, splitPrompt,
  READ_CHECK_IDS, READ_CHECK_LABELS, type ReadCheckId, type ReadCheckText,
} from './read-checks';

// The sentences below are published Reads from eddy_generation_log on
// 2026-11-17, the first day inputs were kept. They are the cases the rules
// were written against, so a rule that stops catching one has regressed.

const status = (text: Partial<ReadCheckText>, prompt: string | null = null) =>
  Object.fromEntries(
    checkRead({ summary: null, eddyRead: null, full: null, ...text }, { prompt }).map((r) => [r.id, r.status]),
  ) as Record<ReadCheckId, 'pass' | 'fail' | 'skip'>;

const PROMPT = [
  'Generate an update for: Mulberry River',
  '[AUTHORITATIVE FACTS]',
  'Gauge: Mulberry River near Mulberry, AR. Reading: 1.03 ft, 46 cfs.',
  'Optimal range: 2.00–3.50 ft.',
  '[TRAJECTORY]',
  '24h change: -0.04 ft',
  '[3-DAY FORECAST]',
  'Tuesday: Clear, 34-58°F, 0% rain, wind 6 mph',
  'Rain in the past 3 hours: 0.12 in at Ozark',
  '[LOCAL KNOWLEDGE — use to inform your update, not recite]',
  '=== mulberry River Knowledge ===',
  '- Below about 1.5 ft at Turner Bend the river turns scrapy.',
  '- Wolf Pen to Redding is about 12 miles.',
].join('\n');

test('every rule has a label, and checkRead reports every rule once', () => {
  const results = checkRead({ summary: 'A.', eddyRead: 'B.', full: 'C.' }, { prompt: PROMPT });
  assert.deepEqual(results.map((r) => r.id), [...READ_CHECK_IDS]);
  for (const id of READ_CHECK_IDS) assert.ok(READ_CHECK_LABELS[id]);
});

test('measurements carry their unit, both ends of a range, and bare numbers are left alone', () => {
  const units = (s: string) => measurementsIn(s).map((m) => `${m.value} ${m.unit}`).sort();
  assert.deepEqual(units('At 46 cfs, even that spring boost has not been enough.'), ['46 cfs']);
  assert.deepEqual(units('best between about 100 and 400 cfs'), ['100 cfs', '400 cfs']);
  assert.deepEqual(units('The optimal range is 1,190–2,700 cfs.'), ['1190 cfs', '2700 cfs']);
  assert.deepEqual(units('at 4.86 ft, you are below even that'), ['4.86 ft']);
  assert.deepEqual(units('running at its usual 58°F with a 20% chance'), ['20 percent', '58 degF']);
  assert.deepEqual(units('put Eureka at river mile 5.0'), ['5 mi']);
  // "The low 5s", "three clear days", "81 million gallons": no unit this module knows.
  assert.deepEqual(units('The low 5s are the bony end. Three clear days. About 81 million gallons a day.'), []);
  // A preposition is not inches.
  assert.deepEqual(units('3 in a row'), []);
});

test('a flat forecast about the river or the weather is found; the reader\'s own float is not one', () => {
  // Courtois, Eleven Point, Kings River, 2026-11-17.
  assert.equal(flatForecasts('Both creeks respond fast to rain, but three clear days in a row means no help is on the way.').length, 1);
  assert.equal(flatForecasts("Without rain in the forecast, this stretch isn't going anywhere soon.").length, 1);
  assert.equal(flatForecasts('The river will stay low through the week.').length, 1);
  assert.equal(flatForecasts('It will not come up without rain.').length, 1);
  assert.equal(flatForecasts('No rain is coming.').length, 1);

  // James and the prompt's own example: today's water, in the future tense.
  assert.deepEqual(flatForecasts('The upper James drops out even faster, and you will spend more time dragging than floating up there.'), []);
  assert.deepEqual(flatForecasts('Lighter canoes and kayaks will move through the riffles more easily than rafts at this level.'), []);
  // Hedged, which is what the prompt asks for.
  assert.deepEqual(flatForecasts('Rain could bring it up fast on a creek this size, but nothing in the outlook points that way yet.'), []);
  assert.deepEqual(flatForecasts('If the dry forecast holds, the river will keep dropping.'), []);
  // Black, Buffalo and Big River at Byrnesville, 2026-11-17: the future tense
  // used for what the water is like at this level. Not forecasts.
  assert.deepEqual(flatForecasts('Lighter craft will have an easier go than heavier ones.'), []);
  assert.deepEqual(flatForecasts('The middle Buffalo near St. Joe is floatable but running lower than typical, with shallow riffles that will have you dragging in spots.'), []);
  assert.deepEqual(flatForecasts('At 136 cfs the connections between pools will be thin, so plan for shorter segments.'), []);
  // Big River and upper Jacks Fork, same day: these are.
  assert.equal(flatForecasts('The dry, clear forecast through Thursday means no rain is on its way to change things.').length, 1);
  assert.equal(flatForecasts('With no rain in the forecast, this stretch is not going to recover on its own soon.').length, 1);
  assert.equal(flatForecasts('It will be cold tomorrow.').length, 1);
  // A river that is coming up is rising now.
  assert.deepEqual(flatForecasts('The river is coming up after last night\'s rain.'), []);
  // A habit, not a prediction.
  assert.deepEqual(flatForecasts("War Eagle drains fast and drops fast, so when it's this low, it stays that way until rain moves through the watershed."), []);
});

test('the short Read is held to its length, to no measurements and to no forecast talk', () => {
  // Jacks Fork, 2026-11-17: 313 characters and a reading.
  const jacksFork = 'Alley Spring sits right at the dividing line between two very different stretches. Above it, the river is rain-dependent and can go dry for weeks; below it, the spring\'s big outflow carries the river even in dry spells. At 46 cfs, even that spring boost hasn\'t been enough to bring the gauge up to a floatable level.';
  assert.deepEqual(
    (({ read_length, read_measurements, read_forecast_talk }) => ({ read_length, read_measurements, read_forecast_talk }))(status({ eddyRead: jacksFork })),
    { read_length: 'fail', read_measurements: 'fail', read_forecast_talk: 'pass' },
  );
  // Mulberry, 2026-11-17: the outlook, and a weekday.
  const mulberry = 'This stretch lives and dies by rainfall, and the three-day outlook is clear skies all the way through Thursday.';
  assert.equal(status({ eddyRead: mulberry }).read_forecast_talk, 'fail');
  // The prompt's own Van Buren example passes all three.
  const vanBuren = 'Van Buren sits well down the river, so this reading speaks for the lower Current. Up around Akers, a dry spell can leave a lot less water than this gauge suggests.';
  const s = status({ eddyRead: vanBuren, summary: 'An easygoing float looks good on the lower Current near Van Buren.' });
  assert.deepEqual([s.summary_length, s.read_length, s.read_measurements, s.read_forecast_talk, s.flat_forecast], ['pass', 'pass', 'pass', 'pass', 'pass']);
});

test('a missing block is skipped, not passed', () => {
  const s = status({ full: 'Floatable today.' });
  assert.deepEqual([s.summary_length, s.read_length, s.read_measurements, s.read_forecast_talk], ['skip', 'skip', 'skip', 'skip']);
  assert.equal(s.flat_forecast, 'pass');
});

test('the prompt splits into facts and the knowledge block', () => {
  const { facts, knowledge } = splitPrompt(PROMPT);
  assert.match(facts, /Reading: 1\.03 ft, 46 cfs/);
  assert.doesNotMatch(facts, /Turner Bend/);
  assert.match(knowledge, /Turner Bend/);
  // A gauge Read's knowledge block sits in the middle, before [THIS GAUGE].
  const gauge = splitPrompt('[RIVER KNOWLEDGE — about the whole river]\n- Ideal is 2.0 ft at Akers.\n\n[THIS GAUGE]\nReading: 3.1 ft');
  assert.match(gauge.knowledge, /Akers/);
  assert.match(gauge.facts, /Reading: 3\.1 ft/);
  assert.doesNotMatch(gauge.facts, /Akers/);
});

test('numbers are skipped without a prompt, because there is nothing to hold them against', () => {
  const s = status({ full: 'The gauge reads 9,999 cfs.' }, null);
  assert.deepEqual([s.numbers_match_inputs, s.numbers_from_knowledge], ['skip', 'skip']);
});

test('a measurement must be in the facts, in the same unit, as written or honestly rounded', () => {
  const ok = status({ full: 'The gauge reads 1.03 ft, about 50 cfs, below the 2.00 to 3.50 ft optimal range. It fell 0.04 ft in a day. Expect 58 degrees and 6 mph wind.' }, PROMPT);
  assert.deepEqual([ok.numbers_match_inputs, ok.numbers_from_knowledge], ['pass', 'pass']);

  // The right number in the wrong unit is a different claim.
  assert.equal(status({ full: 'The gauge reads 46 ft.' }, PROMPT).numbers_match_inputs, 'fail');
  // A number nobody supplied.
  const invented = checkRead({ summary: null, eddyRead: null, full: 'It needs about 2,400 cfs to float.' }, { prompt: PROMPT });
  assert.deepEqual(invented.find((r) => r.id === 'numbers_match_inputs'), { id: 'numbers_match_inputs', status: 'fail', detail: '2,400 cfs' });
});

test('a number copied from the knowledge file is reported apart from an invented one', () => {
  // Mulberry, 2026-11-17: a Turner Bend staff-gauge line printed beside a USGS reading.
  const s = checkRead(
    { summary: null, eddyRead: 'Below about 1.5 ft at Turner Bend the river turns scrapy and the run becomes a walk more than a float.', full: null },
    { prompt: PROMPT },
  );
  assert.equal(s.find((r) => r.id === 'numbers_match_inputs')?.status, 'pass');
  assert.deepEqual(s.find((r) => r.id === 'numbers_from_knowledge'), { id: 'numbers_from_knowledge', status: 'fail', detail: '1.5 ft' });
});

test('a Read that describes the weather is counted; the river and its rain are not weather', () => {
  const weather = (text: string) => status({ full: text }).weather_talk;
  // Current and Spring River, 2026-11-17, written when the prompt still carried weather.
  assert.equal(weather('Good floating near Van Buren, with calm, steady water and a clear November sky.'), 'fail');
  assert.equal(weather('The Spring River at Hardy is floating well on a clear, cold November week, steady water and no crowds.'), 'fail');
  assert.equal(weather('Expect 58 degrees and a light breeze by afternoon.'), 'fail');
  assert.equal(weather('Highs near 60 make it a comfortable day on the water.'), 'fail');

  // Cold water and clear water are the river.
  assert.equal(weather('The water runs cold and clear below the spring, and the riffles are shallow.'), 'pass');
  // Rain that fell, or could, is river news.
  assert.equal(weather('Rain could bring it up fast on a creek this size.'), 'pass');
  assert.equal(weather('It has dropped steadily since the last rain moved through.'), 'pass');
  // A dry spell is a pattern, not a sky.
  assert.equal(weather('Up around Akers, a dry spell can leave a lot less water than this gauge suggests.'), 'pass');
});
