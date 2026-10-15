import assert from 'node:assert/strict';
import test from 'node:test';
import {
  campingInventoryCheck,
  campingInventoryFindings,
  type CampingFacility,
  type CampingObservation,
} from './camping-inventory';
import { getCheck } from '../registry';
import { severityForRule } from '../severity';
import { hasRemediation } from '../remediation';
const NOW = new Date('2026-10-15T12:00:00Z');
const facility = (extra: Partial<CampingFacility> = {}): CampingFacility => ({
  id: 'park',
  display_name: 'Park',
  enabled: true,
  source: 'mo_state_parks',
  source_facility_id: '1',
  source_loop: null,
  last_synced_at: NOW.toISOString(),
  nearby_services: {
    reservation_url: 'https://icampmo1.usedirect.com/ICampMO/',
  },
  nps_campgrounds: null,
  observations: [{ count: 20 }],
  ...extra,
});
const row = (
  date: string,
  status = 'open',
  fetched_at = NOW.toISOString(),
): CampingObservation => ({ facility_id: 'park', date, status, fetched_at });

test('tracked campgrounds need the same usable URL that the app actually renders', () => {
  for (const reservation_url of [
    null,
    '',
    'javascript:alert(1)',
    'https://example.com/book',
  ]) {
    assert.equal(
      campingInventoryFindings(
        [facility({ nearby_services: { reservation_url } })],
        [],
      )[0]?.ruleKey,
      'camping_missing_reservation_url',
    );
  }
  assert.deepEqual(campingInventoryFindings([facility()], []), []);
  assert.deepEqual(
    campingInventoryFindings(
      [
        facility({
          nearby_services: null,
          nps_campgrounds: {
            reservation_url: 'https://icampmo1.usedirect.com/ICampMO/',
          },
        }),
      ],
      [],
    ),
    [],
  );
  assert.deepEqual(
    campingInventoryFindings(
      [
        facility({
          source: 'recreation_gov',
          source_loop: 'Alley',
          source_facility_id: '123',
          nearby_services: null,
        }),
      ],
      [],
    ),
    [],
  );
});
test('an enabled attempted sync with zero observations is caught, but a never-attempted or disabled facility is not', () => {
  const empty = facility({ observations: [{ count: 0 }] });
  const findings = campingInventoryFindings([empty], []);
  assert.deepEqual(
    findings.map((f) => f.ruleKey),
    ['camping_synced_without_observations'],
  );
  assert.equal(findings[0].entityKey, 'campground:park');
  assert.deepEqual(
    campingInventoryFindings([{ ...empty, last_synced_at: null }], []),
    [],
  );
  assert.deepEqual(
    campingInventoryFindings(
      [{ ...empty, enabled: false, nearby_services: null }],
      [],
    ),
    [],
  );
  assert.deepEqual(
    campingInventoryFindings([facility()], []),
    [],
    'no current-season rows is not the same as no observations ever',
  );
});
test('calendar gaps cross months, count explicit closures and unreleased dates, and exclude unobserved tails', () => {
  const findings = campingInventoryFindings(
    [facility()],
    [
      row('2026-10-30'),
      row('2026-11-01', 'closed'),
      row('2026-11-02', 'not_yet_released'),
    ],
  );
  assert.deepEqual(
    findings.map((f) => f.ruleKey),
    ['camping_calendar_gaps'],
  );
  assert.deepEqual(findings[0].evidence?.missingDates, ['2026-10-31']);
  assert.deepEqual(
    campingInventoryFindings(
      [facility()],
      [
        row('2026-10-30'),
        row('2026-10-31', 'closed'),
        row('2026-11-01', 'not_yet_released'),
      ],
    ),
    [],
  );
  assert.deepEqual(
    campingInventoryFindings([facility()], [row('2026-11-01', 'closed')]),
    [],
  );
});
test('older observations cannot hide holes in the newest calendar snapshot', () => {
  const findings = campingInventoryFindings(
    [facility()],
    [
      row('2026-11-01'),
      row('2026-11-03'),
      row('2026-11-02', 'open', '2026-10-14T12:00:00Z'),
    ],
  );
  assert.deepEqual(findings[0].evidence?.missingDates, ['2026-11-02']);
});

/** Enforces range reads and query filters, including a silent 900-row cap. */
function fake(
  facilities: CampingFacility[],
  observations: CampingObservation[],
  failTable?: string,
) {
  const pages: { table: string; from: number }[] = [];
  return {
    pages,
    db: {
      from(table: string) {
        const predicates: ((row: Record<string, unknown>) => boolean)[] = [];
        const q = {
          select: () => q,
          order: () => q,
          eq: (key: string, value: unknown) => {
            predicates.push((r) => r[key] === value);
            return q;
          },
          in: (key: string, values: unknown[]) => {
            predicates.push((r) => values.includes(r[key]));
            return q;
          },
          gte: (key: string, value: string) => {
            predicates.push((r) => String(r[key]) >= value);
            return q;
          },
          lte: (key: string, value: string) => {
            predicates.push((r) => String(r[key]) <= value);
            return q;
          },
          range: async (from: number, to: number) => {
            pages.push({ table, from });
            const rows =
              table === 'campsite_facilities' ? facilities : observations;
            return table === failTable
              ? { data: null, error: { message: 'unreachable' } }
              : {
                  data: rows
                    .filter((r) =>
                      predicates.every((p) =>
                        p(r as unknown as Record<string, unknown>),
                      ),
                    )
                    .slice(from, Math.min(to + 1, from + 900)),
                  error: null,
                };
          },
        };
        return q;
      },
    },
  };
}
test('scheduled check pages facilities and observations without silently dropping the last campground', async () => {
  const facilities = Array.from({ length: 901 }, (_, i) =>
    facility({
      id: `park-${i}`,
      nearby_services: i === 900 ? null : facility().nearby_services,
    }),
  );
  const observations = facilities.flatMap((f) =>
    [row('2026-11-01'), row('2026-11-02')].map((r) => ({
      ...r,
      facility_id: f.id,
    })),
  );
  const client = fake(facilities, observations);
  const result = await campingInventoryCheck.run({
    supabase: client.db,
    now: NOW,
    deadlineMs: Date.now() + 10000,
  });
  assert.equal(result.scopeCount, 901);
  assert.deepEqual(
    result.findings.map((f) => f.entityKey),
    ['campground:park-900'],
  );
  assert.ok(
    client.pages.some(
      (p) => p.table === 'campsite_facilities' && p.from === 900,
    ),
  );
  assert.ok(
    client.pages.some(
      (p) => p.table === 'campsite_availability' && p.from === 1800,
    ),
  );
});
test('read failures and deadlines cannot become a clean reconciliable run', async () => {
  for (const table of ['campsite_facilities', 'campsite_availability']) {
    await assert.rejects(
      campingInventoryCheck.run({
        supabase: fake([facility()], [], table).db,
        now: NOW,
        deadlineMs: Date.now() + 10000,
      }),
      /unreachable/,
    );
  }
  const result = await campingInventoryCheck.run({
    supabase: fake([facility()], []).db,
    now: NOW,
    deadlineMs: 0,
  });
  assert.equal(result.partial, true);
});
test('the daily check and all three rules are registered, classified and actionable', () => {
  assert.equal(getCheck('camping_inventory'), campingInventoryCheck);
  assert.equal(campingInventoryCheck.cadence, 'daily');
  for (const rule of [
    'camping_missing_reservation_url',
    'camping_synced_without_observations',
    'camping_calendar_gaps',
  ]) {
    assert.equal(severityForRule(rule), 'medium');
    assert.ok(hasRemediation(rule));
  }
});
