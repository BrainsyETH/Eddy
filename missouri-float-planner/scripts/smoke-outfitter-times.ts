/** Offline sanity check of the ACTUAL route service's model fallback.
 * Uses outfitter-published miles, empty published-time DB, seeded vessel speeds,
 * normal water and no river curve. This is not live endpoint/geometry validation.
 * Run: TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx scripts/smoke-outfitter-times.ts
 * --strict exits nonzero for reviews (range disjoint OR midpoint bias >25%).
 */
import { routeFixture } from '../src/lib/calculations/route-estimate-fixture';

const AKERS = 'https://www.currentrivercanoe.com/crfloats.html';
const BASS = 'https://bassresort.com/frequently-asked-questions/';
const references: Array<{ route: string; miles: number; min: number; max: number; vessel: 'canoe' | 'raft' | 'tube'; source: string }> = [
  { route: 'Cedar Grove → Akers', miles: 8, min: 3, max: 5, vessel: 'canoe', source: AKERS },
  { route: 'Akers → Pulltite', miles: 12, min: 4, max: 6, vessel: 'canoe', source: AKERS },
  { route: 'Baptist Camp → Akers', miles: 16, min: 6, max: 8, vessel: 'canoe', source: AKERS },
  { route: 'Akers → Round Spring', miles: 22, min: 7, max: 9, vessel: 'canoe', source: AKERS },
  { route: 'Blunt → Bass', miles: 6, min: 3, max: 4, vessel: 'canoe', source: BASS },
  { route: 'Cedar Grove → Akers', miles: 8, min: 6, max: 7, vessel: 'raft', source: AKERS },
  { route: 'Blunt → Bass', miles: 6, min: 4, max: 6, vessel: 'raft', source: BASS },
  { route: 'Welch Landing → Akers', miles: 2.5, min: 2, max: 3, vessel: 'tube', source: AKERS },
  { route: 'Cedar Grove → Akers', miles: 8, min: 8, max: 10, vessel: 'tube', source: AKERS },
];
async function main() {
  let reviews = 0;
  console.log('Sources checked 2026-09-16. Stop assumptions unspecified; normal water is our test assumption.');
  console.log('| Route | Vessel | Miles | Published hours | Eddy range | Midpoint bias | Result |');
  console.log('| --- | --- | ---: | --- | --- | ---: | --- |');
  for (const ref of references) {
    const { floatTime } = await routeFixture({ miles: ref.miles, vessel: ref.vessel }).estimate('typical');
    if (!floatTime?.timeRange) throw new Error(`No estimate: ${ref.route}`);
    const { min, max } = floatTime.timeRange;
    const bias = ((min + max) / 120 / ((ref.min + ref.max) / 2) - 1) * 100;
    const overlaps = max / 60 >= ref.min && min / 60 <= ref.max;
    const review = !overlaps || Math.abs(bias) > 25;
    if (review) reviews++;
    console.log(`| ${ref.route} | ${ref.vessel} | ${ref.miles} | ${ref.min}–${ref.max} | ${floatTime.formattedCompact} | ${bias.toFixed(1)}% | ${review ? 'REVIEW' : 'Close'} |`);
  }
  console.log(`${references.length - reviews}/${references.length} close; ${reviews} need review. Published-range lookup is deliberately disabled to avoid testing sources against themselves.`);
  console.log(`Sources: ${AKERS} ; ${BASS}`);
  if (process.argv.includes('--strict') && reviews) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
