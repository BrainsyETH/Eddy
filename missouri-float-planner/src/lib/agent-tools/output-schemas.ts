import { z } from 'zod';
import { resultShape, statusSchema } from './contracts';

const nullableNumber = z.number().nullable();
const timestamp = z.string().nullable();
const observed = { observedAt: timestamp, ageMinutes: nullableNumber, stale: z.boolean().nullable() };
const record = z.record(z.unknown());
const component = z.object({ status: statusSchema }).passthrough();
const gauge = z.object({ id: z.string().nullable(), name: z.string().nullable(), usgsSiteId: z.string().nullable(), gaugeHeightFt: nullableNumber, dischargeCfs: nullableNumber, conditionCode: z.string(), ...observed }).passthrough();
const access = z.object({ id: z.string(), name: z.string(), slug: z.string().nullable(), riverMile: nullableNumber, isFloatEndpoint: z.boolean(), url: z.string() }).passthrough();
const outlook = z.object({ status: statusSchema, days: z.array(z.object({ date: z.string(), valueFt: nullableNumber, conditionCode: z.string().nullable() })), issuedAt: timestamp }).passthrough();
const services = z.object({ status: statusSchema, items: z.array(z.object({ id: z.string(), name: z.string(), type: z.string(), distanceMiles: nullableNumber }).passthrough()), truncated: z.boolean() }).passthrough();
const plan = z.object({
  url: z.string(), requestedDate: z.string(), timeZone: z.string(), vesselType: z.string(),
  putIn: access, takeOut: access, distanceMiles: z.number(), estimateBasis: z.literal('current_conditions'),
  estimatedFloatTime: z.object({ minutes: z.number(), formatted: z.string(), timeRange: z.object({ min: z.number(), max: z.number() }).optional() }).passthrough().nullable(),
  floatTimeWithheldReason: z.string().nullable(), anchorGauge: gauge,
  routeAssessment: z.object({ conditionCode: z.string(), label: z.string(), spanCheckComplete: z.boolean(), recommendationStatus: z.enum(['candidate', 'conditional', 'not_recommended']), contributingGauges: z.array(record) }),
  hazards: component, alerts: component, outlooks: z.array(outlook), weather: component, outfitters: component,
}).passthrough();

/** Describe stable useful fields, while allowing additive component detail.
 * Errors have their own shape so an unavailable source never needs invented
 * readings just to satisfy the MCP output contract. */
const dataSchemas: Record<string, z.ZodTypeAny> = {
  list_rivers: z.object({ rivers: z.array(z.object({ id: z.string(), name: z.string(), slug: z.string(), state: z.string().nullable(), url: z.string() }).passthrough()), states: z.array(z.string().nullable()), coverageUrl: z.string() }).passthrough(),
  get_river: z.object({ id: z.string(), name: z.string(), slug: z.string(), url: z.string() }).passthrough(),
  get_conditions: z.object({ river: z.string(), gauge: gauge.nullable(), url: z.string() }).passthrough(),
  get_access_points: z.object({ river: z.string(), accessPoints: z.array(access), url: z.string() }).passthrough(),
  get_hazards: z.object({ river: z.string(), hazards: z.array(record), truncated: z.boolean(), source: z.string() }).passthrough(),
  get_gauges: z.object({ gauges: z.array(gauge), nextOffset: nullableNumber, totalRatings: z.number() }).passthrough(),
  get_weather: z.object({ status: statusSchema, source: z.string(), current: record.nullable(), days: z.array(record) }).passthrough(),
  get_outlook: outlook,
  get_river_alerts: z.object({ status: statusSchema, alerts: z.array(record), sources: z.array(component), checkedAllApplicable: z.boolean(), critical: z.boolean() }).passthrough(),
  get_services: services,
  get_drive_estimate: z.object({ status: statusSchema, available: z.boolean(), minutes: z.number().optional(), miles: z.number().optional(), reason: z.string().optional() }).passthrough(),
  plan_float: plan,
  find_floats: z.object({ recommendations: z.array(z.object({ ...resultShape, data: plan, reasons: z.array(z.string()) })), evaluated: z.number().optional(), maxEstimates: z.number().optional(), failedCandidates: z.number().optional(), reason: z.string().nullable() }).passthrough(),
};
export function outputSchema(name: string) {
  return z.object({ ...resultShape, data: z.union([dataSchemas[name], z.object({ message: z.string(), issues: z.array(record).optional() })]) });
}
