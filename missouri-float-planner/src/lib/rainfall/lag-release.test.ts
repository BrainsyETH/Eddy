import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { measuredLag, RAIN_LAG_RELEASE, RAIN_LAG_STUDY } from './lag-release';

const root = join(__dirname, '..', '..', '..');
interface Gauge { site: string; result: 'range' | 'no_range'; reason: string | null; verdict: { publish: { crestHours: [number, number]; riseHours: [number, number] | null; storms: number } | null } | null }
const study = JSON.parse(readFileSync(join(root, RAIN_LAG_STUDY, 'results', 'results.json'), 'utf8')) as { gauges: Gauge[]; notStudied: { site: string }[] };

test('the release list is exactly the gauges the study gave a range, with the study\'s numbers', () => {
  const earned = Object.fromEntries(study.gauges.filter(gauge => gauge.result === 'range')
    .map(gauge => [gauge.site, { crestHours: gauge.verdict!.publish!.crestHours, storms: gauge.verdict!.publish!.storms }]));
  assert.deepEqual(RAIN_LAG_RELEASE, earned);
  assert.ok(Object.keys(earned).length > 0);
});

test('a gauge the study gave a reason instead of a range has no lag', () => {
  const without = [...study.gauges.filter(gauge => gauge.result === 'no_range').map(gauge => gauge.site), ...study.notStudied.map(row => row.site)];
  assert.ok(without.length > 0);
  for (const site of without) assert.equal(measuredLag(site), null, site);
});

test('no gauge earned a time-to-rise range, so the list and the sentence carry none', () => {
  // If a later study releases one, the type, the list and the wording all need a decision. Fail here first.
  assert.deepEqual(study.gauges.filter(gauge => gauge.verdict?.publish?.riseHours).map(gauge => gauge.site), []);
});

test('the release list is the only place shipped code takes a rain lag from, and nothing reads a recovery rate', () => {
  // The unsourced per-river lag estimates and recovery rates are gone, and nothing may bring them back.
  const files: string[] = [];
  const walk = (folder: string) => {
    for (const name of readdirSync(folder)) {
      const path = join(folder, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
    }
  };
  walk(join(root, 'src'));
  walk(join(root, 'shared'));
  const offenders = files.filter(file => !file.endsWith(join('src', 'types', 'database.ts'))
    && /rain_lag_hours|rain_lag_note|rainLagHours|rainLagNote|RAIN_LAG\b|RAIN-TO-RIVER|drop_rate_note|dropRateNote|recoveryNote|Recovery rate/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders.map(file => file.slice(root.length + 1)), []);
  const route = readFileSync(join(root, 'src', 'app', 'api', 'rivers', '[slug]', 'outlook', 'route.ts'), 'utf8');
  assert.match(route, /rainLag: measuredLag\(station\?\.usgs_site_id\)/);
  const users = files.filter(file => /\brainLag\b/.test(readFileSync(file, 'utf8'))).map(file => file.slice(root.length + 1)).sort();
  assert.deepEqual(users, ['src/app/api/rivers/[slug]/outlook/route.ts', 'src/lib/river-outlook.ts']);
});

// A span of time: "in 24 hours", "within hours", "over days", "in under an hour",
// "feet in minutes", "one day and dry rock the next".
const SPAN = /\b(?:in|within|under|over|inside(?: of)?)\s+(?:(?:less than|about|roughly|just|under)\s+)?(?:(?:an?|one|two|three|four|five|six|a few|a couple(?: of)?|several|\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?)\s+)?(?:minutes?|hours?|hrs?|days?|weeks?)\b|\bone day\b[^.!?]*\bthe next\b/i;
// The water changing: rising, falling, coming back, going from one state to another.
const CHANGE = /\b(?:ris(?:e|es|ing)|rose|spik(?:e|es|ing)|drops?|dropping|falls?|falling|fell|reced(?:e|es|ed|ing)|recover(?:s|y|ed|ing)?|comes? (?:up|down|back)|go(?:es)? from|(?:un)?floatable|runnable|crests?|flood(?:s|ed|ing)?)\b/i;
// A rate: "0.3-0.6 ft/day", "2 ft per hour", "500 cfs an hour".
const RATE = /\b\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?\s*(?:ft|feet|foot|inch(?:es)?|cfs)\s*(?:\/\s*|per\s+|an?\s+|each\s+)(?:min(?:ute)?|h(?:ou)?r|day|week)s?\b/i;
// Below a dam the river moves when the dam does, and how fast it comes up is
// the hazard: docs/WATER_REGIMES_STRATEGY.md ("Level moves in minutes, not
// hours") and the tailwater Reads' own lines (src/lib/eddy/tailwater-river-read.ts).
// That is not a rain lag or a recovery, so a sentence about the dam's release
// on one of these rivers may say it. Nothing else on them may.
const DAM_CONTROLLED = new Set(['white', 'norfork-tailwater', 'taneycomo']);
const DAM_RELEASE = /\b(?:generat\w*|release[sd]?|units?|dam)\b/i;

/** The sentences of EDDY_KNOWLEDGE.md that state a lag, a rate or a timeline, with the river each is under. */
function knowledgeTimelines(text: string): string[] {
  const found: string[] = [];
  let river = '';
  for (const line of text.split('\n')) {
    const heading = line.match(/^## (.+)/);
    if (heading) { river = heading[1].match(/\{#([a-z0-9-]+)\}/)?.[1] ?? heading[1].trim().toLowerCase(); continue; }
    for (const sentence of line.replace(/\b(St|Mt|Hwy)\.\s/g, '$1 ').split(/(?<=[.!?])\s+/)) {
      const claim = RATE.test(sentence) || /RAIN-TO-RIVER|recovery rate/i.test(sentence) || (SPAN.test(sentence) && CHANGE.test(sentence));
      if (!claim) continue;
      if (DAM_CONTROLLED.has(river) && DAM_RELEASE.test(sentence)) continue;
      found.push(`${river || 'front matter'}: ${sentence.trim()}`);
    }
  }
  return found;
}

test('the knowledge file states no rain lag, recovery rate or timeline', () => {
  // Every Read is handed this file, and the brief tells it not to say how many
  // hours rain takes to reach the gauge or give a rate or a timeline for the
  // river coming back down (src/lib/eddy/read-brief.ts). A number here is one
  // it will repeat. The measured lags are not a way back in: the study's
  // ranges go to the outlook only (RAIN_LAG_RELEASE), and the Read is told
  // not to state one.
  assert.deepEqual(knowledgeTimelines(readFileSync(join(root, 'EDDY_KNOWLEDGE.md'), 'utf8')), []);
});

test('the knowledge guard catches the shapes it is for, and not trip lengths', () => {
  const caught = [
    '## Test {#test}',
    '- It can go from floatable to unfloatable in 24 hours during dry spells.',
    '- When it rains hard, expect the gauge to spike 5-10 ft in hours.',
    '- Rises arrive within hours of upstream rain.',
    '- It recovers slowly over days.',
    '- It can be a runnable river one day and dry rock the next.',
    '- It drops 0.3-0.6 ft/day after a rise.',
    '## White River {#white}',
    '- The Buffalo comes up within hours of rain.',
  ].join('\n');
  assert.equal(knowledgeTimelines(caught).length, 7);
  const quiet = [
    '## Test {#test}',
    '- Shorter float sections mean you can do a full trip in 3-4 hours.',
    '- Four to six hours when the water is on the low side.',
    '- It rises fast after rain.',
    '## Lake Taneycomo {#taneycomo}',
    '- Water can come up feet in minutes close to the dam.',
  ].join('\n');
  assert.deepEqual(knowledgeTimelines(quiet), []);
});
