import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { gaugePaths, gaugeSchemas } from './openapi';
// Validate the schema features used here against captured response shapes.
type Schema = { $ref?: string; anyOf?: Schema[]; type?: string | string[]; properties?: Record<string, Schema>; required?: string[]; items?: Schema; enum?: unknown[]; const?: unknown };
function valid(schema: Schema, value: unknown): boolean {
  if (schema.$ref) return valid((gaugeSchemas as Record<string, Schema>)[schema.$ref.split('/').pop()!],value);
  if (schema.anyOf) return schema.anyOf.some(s => valid(s,value));
  if (schema.enum && !schema.enum.includes(value)) return false;
  if ('const' in schema && schema.const !== value) return false;
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (schema.type && !(Array.isArray(schema.type) ? schema.type : [schema.type]).some(t => t === type || t === 'integer' && Number.isInteger(value))) return false;
  if (value === null) return true;
  if (schema.items && Array.isArray(value)) return value.every(v => valid(schema.items!,v));
  if (schema.properties && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string,unknown>;
    return (schema.required ?? []).every(k => k in obj) && Object.entries(schema.properties).every(([k,s]) => !(k in obj) || valid(s,obj[k]));
  }
  return true;
}
for (const [fixture,name] of [['history','GaugeHistoryResponse'],['national-detail','GaugeDetailResponse'],['curated-detail','GaugeDetailResponse'],['map','MapGaugesResponse'],['list','GaugesResponse']] as const) {
  test(`OpenAPI matches ${fixture} envelope and nullable response fields`, () => {
    const body = JSON.parse(fs.readFileSync(path.join(process.cwd(),'src/lib/gauges/fixtures',`${fixture}.json`),'utf8'));
    assert.equal(valid(gaugeSchemas[name],body),true);
    assert.equal(valid(gaugeSchemas[name],[]),false); assert.equal(valid(gaugeSchemas[name],{}),false);
  });
}
test('OpenAPI exposes range and viewport parameters and actual reading field names', () => {
  assert.deepEqual(gaugePaths['/api/gauges/{siteId}/history'].get.parameters.map(p => p.name),['siteId','days','from','to','resolution']);
  assert.deepEqual(gaugePaths['/api/gauges/map'].get.parameters.map(p => p.name),['bbox','limit','curated']);
  assert.equal(gaugeSchemas.GaugeReading.required.includes('timestamp'),true);
  assert.equal('latestReading' in gaugeSchemas.GaugeStation.properties,false);
});
