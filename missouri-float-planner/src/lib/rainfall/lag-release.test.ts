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
  assert.deepEqual(Object.fromEntries(Object.entries(RAIN_LAG_RELEASE).map(([site, lag]) => [site, { crestHours: lag.crestHours, storms: lag.storms }])), earned);
  assert.ok(Object.keys(earned).length > 0);
});

test('each released gauge is worded with its own river and place', () => {
  const names = new Map(study.gauges.map(gauge => [gauge.site, (gauge as unknown as { name: string }).name]));
  for (const [site, lag] of Object.entries(RAIN_LAG_RELEASE)) {
    const name = names.get(site)!;
    // "the St. Francis" must be the river the gauge is on, and "near Patterson" a place in the gauge's own name.
    assert.ok(name.startsWith(lag.river.replace(/^the /, '')), `${site}: ${lag.river} is not the river in "${name}"`);
    assert.ok(name.includes(lag.place.replace(/^(at|near|above) (the town of )?/, '')), `${site}: ${lag.place} is not in "${name}"`);
    assert.match(lag.place, /^(at|near|above) /);
  }
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

test('the release list is the only place shipped code takes a rain lag from', () => {
  // The unsourced per-river estimates are gone, and nothing may bring a second source back.
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
    && /rain_lag_hours|rain_lag_note|rainLagHours|rainLagNote|RAIN_LAG\b|RAIN-TO-RIVER/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders.map(file => file.slice(root.length + 1)), []);
  const route = readFileSync(join(root, 'src', 'app', 'api', 'rivers', '[slug]', 'outlook', 'route.ts'), 'utf8');
  assert.match(route, /rainLag: measuredLag\(station\?\.usgs_site_id\)/);
  const users = files.filter(file => /\brainLag\b/.test(readFileSync(file, 'utf8'))).map(file => file.slice(root.length + 1)).sort();
  assert.deepEqual(users, ['src/app/api/rivers/[slug]/outlook/route.ts', 'src/lib/river-outlook.ts']);
});
