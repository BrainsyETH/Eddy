import { z } from 'zod';

const name = z.string().min(1).max(160);
const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
const nullableId = id.nullable();
const time = z.number().finite().nonnegative();
const mileValue = z.number().finite().min(-100).max(10000);
const mile = mileValue.nullable();
const observedAt = z.string().datetime();

// The recap context (docs/float-history-card-plan.md, 2e). Each is optional
// and strict, and is only sent to a server advertising `recapContext`.
const startCondition = z
  .object({
    code: z.enum(['too_low', 'low', 'good', 'flowing', 'high', 'dangerous']),
    gaugeName: name,
    // Null for a station USGS does not run (USACE tailwaters).
    usgsSiteId: id.nullable(),
    heightFt: z.number().finite().min(-50).max(200).nullable(),
    dischargeCfs: z.number().finite().min(0).max(2_000_000).nullable(),
    observedAt,
    accuracyWarning: z.boolean(),
  })
  .strict();
const riverSpan = z
  .object({
    firstMile: mileValue,
    lastMile: mileValue,
    firstName: name,
    lastName: name,
    /** The mile system (shared/float-recap.ts spanCalibration): 32-bit hex. */
    calibration: z.string().regex(/^[0-9a-f]{8}$/),
  })
  .strict()
  .refine((span) => span.lastMile > span.firstMile, 'River span runs backwards');
/** Sorted, disjoint, each running forwards: what @eddy/geo addCoveredInterval keeps. */
const coveredMiles = z
  .array(z.tuple([mileValue, mileValue]))
  .max(32)
  .refine(
    (intervals) => intervals.every(([a, b], i) => b > a && (i === 0 || a > intervals[i - 1][1])),
    'Covered miles must be sorted and disjoint',
  );
const startWeather = z
  .object({
    tempF: z.number().finite().min(-60).max(140),
    precipIn1h: z.number().finite().min(0).max(10),
    observedAt,
    conditionIcon: z.string().regex(/^(01|02|03|04|09|10|11|13|50)[dn]$/).optional(),
  })
  .strict();
const routeSnapshot = z.object({
  startMile: mileValue,
  takeOutMile: mileValue,
  startName: name,
  calibration: z.string().regex(/^[0-9a-f]{8}$/),
}).strict().refine((route) => route.takeOutMile > route.startMile, 'Take-out must be downstream');
const slug = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9-]+$/);
const completed = z
  .object({
    version: z.literal(1),
    id,
    riverSlug: slug,
    riverName: name,
    putInId: nullableId,
    putInName: name.nullable(),
    startNote: z.string().min(1).max(240).optional(),
    takeOutId: id,
    takeOutName: name,
    boatType: z.enum(['canoe', 'kayak', 'raft', 'tube', 'sup']).nullable(),
    startedAt: time,
    endedAt: time,
    elapsedMs: time,
    movingMs: time,
    stoppedMs: time,
    unknownMs: time,
    distanceMiles: z.number().finite().min(0).max(10000),
    movingMph: z.number().finite().positive().max(100).nullable(),
    plannerMph: z.number().finite().positive().max(100).nullable(),
    firstMile: mile,
    lastMile: mile,
    reachedTakeOut: z.boolean(),
    measurementVersion: z.literal(1),
    startCondition: startCondition.nullable().optional(),
    riverSpan: riverSpan.nullable().optional(),
    coveredMiles: coveredMiles.nullable().optional(),
    startWeather: startWeather.nullable().optional(),
    routeSnapshot: routeSnapshot.nullable().optional(),
  })
  .strict()
  .superRefine((t, ctx) => {
    if (
      t.endedAt < t.startedAt ||
      t.endedAt > Date.now() + 86400000 ||
      Math.abs(t.elapsedMs - (t.endedAt - t.startedAt)) > 1 ||
      Math.abs(t.elapsedMs - t.movingMs - t.stoppedMs - t.unknownMs) > 1
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Inconsistent trip times' });
    }
  });
const saved = z
  .object({
    shortCode: id,
    url: z.string().url().max(2048),
    riverName: name,
    riverSlug: slug,
    putInName: name,
    takeOutName: name,
    putInId: id.optional(),
    takeOutId: id.optional(),
    distanceLabel: z.string().max(80),
    savedAt: z.string().datetime(),
    photoUrl: z.string().url().max(2048).optional(),
  })
  .strict();
export const archiveRow = z
  .object({
    id,
    kind: z.enum(['saved', 'completed']),
    deleted: z.boolean(),
    contributionVersion: z.string().uuid().nullable(),
    payload: z.unknown(),
  })
  .strict()
  .superRefine((row, ctx) => {
    const valid = row.deleted
      ? row.payload === null
      : row.kind === 'completed'
        ? completed.safeParse(row.payload).success && (row.payload as { id: string }).id === row.id
        : saved.safeParse(row.payload).success;
    if (!valid) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid trip summary' });
  });

/** Bound the envelope; individual rows are validated without blocking their neighbours. */
export const archiveEnvelope = z.object({ rows: z.array(z.unknown()).max(20) }).strict();
export const archiveBatch = z.object({ rows: z.array(archiveRow).max(20) }).strict();
