/** Gauge wire contracts: envelopes, nullability, and coverage must match the routes. */
const string = { type: 'string' };
const number = { type: 'number' };
const nullableNumber = { type: ['number', 'null'] };
const nullableString = { type: ['string', 'null'] };
const boolean = { type: 'boolean' };
const time = { type: 'string', format: 'date-time' };
const nullableTime = { type: ['string', 'null'], format: 'date-time' };
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const array = (items: object) => ({ type: 'array', items });
const object = (properties: Record<string, object>, required = Object.keys(properties)) => ({ type: 'object', properties, required });
const nullable = (schema: object) => ({ anyOf: [schema, { type: 'null' }] });
const coordinates = object({ lng: number, lat: number });
const window = nullable(object({ from: time, to: time }));
const reading = { gaugeHeightFt: nullableNumber, dischargeCfs: nullableNumber, readingTimestamp: nullableTime, readingAgeHours: nullableNumber, readingSuspect: boolean };
const freshness = { type: 'string', enum: ['live', 'delayed', 'historical', 'unavailable'], description: 'live: at most 6 hours old; delayed: 6–24 hours; historical: over 24 hours; unavailable: invalid/missing timestamp. Not a safety rating.' };
const temperature = nullable(object({ valueF: number, observedAt: time, source: { const: 'usgs' }, measuredAtSiteId: string, measuredAtName: string }, ['valueF', 'observedAt', 'source']));
const oxygen = nullable(object({ valueMgL: number, observedAt: time, source: { const: 'usgs' }, measuredAtSiteId: string, measuredAtName: string }, ['valueMgL', 'observedAt', 'source']));
const threshold = object({ riverId: string, riverName: string, riverSlug: nullableString, riverState: nullableString, isPrimary: boolean, distanceFromSectionMiles: nullableNumber, thresholdUnit: { enum: ['ft', 'cfs'] }, ...Object.fromEntries(['levelTooLow','levelLow','levelOptimalMin','levelOptimalMax','levelHigh','levelDangerous','floodStageFt'].map(k => [k, nullableNumber])) }, ['riverId','riverName','riverSlug','isPrimary','thresholdUnit','levelTooLow','levelLow','levelOptimalMin','levelOptimalMax','levelHigh','levelDangerous','floodStageFt']);
export const gaugeSchemas = {
  GaugeStation: object({ id: string, usgsSiteId: nullableString, name: string, provider: string, coordinates, active: boolean, ...reading, qualifierNote: nullableString, thresholdDescriptions: nullable({ type: 'object' }), thresholds: nullable(array(threshold)) }, ['id','usgsSiteId','name','coordinates','active',...Object.keys(reading),'qualifierNote','thresholdDescriptions','thresholds']),
  GaugeReading: object({ timestamp: time, gaugeHeightFt: nullableNumber, dischargeCfs: nullableNumber, qualifiers: array(string), gapBefore: array({ enum: ['ft','cfs'] }) }, ['timestamp','gaugeHeightFt','dischargeCfs']),
  MapGaugeLite: object({ id: string, siteId: string, name: string, coordinates, ...reading, curated: boolean, flowPercentile: nullableNumber, freshness }),
  MapGaugesResponse: object({ gauges: array(ref('MapGaugeLite')), total: { type: 'integer', minimum: 0 }, capped: boolean }),
  GaugesResponse: object({ gauges: array(ref('GaugeStation')) }),
  GaugeDetail: object({ id: string, siteId: string, name: string, provider: string, curated: boolean, coordinates, ...reading, qualifierNote: nullableString, flowPercentile: nullableNumber, freshness,
    thresholds: nullable(array(threshold)),
    floodStages: nullable(object({ actionFt: nullableNumber, floodFt: nullableNumber, moderateFt: nullableNumber, majorFt: nullableNumber, lid: nullableString, source: string }, ['actionFt','floodFt','moderateFt','majorFt'])),
    waterTemperature: { ...temperature, description: 'Measurement no more than 24 hours old, otherwise null.' }, dissolvedOxygen: { ...oxygen, description: 'Measurement no more than 24 hours old, otherwise null.' },
    historicalWaterQuality: object({ waterTemperature: temperature, dissolvedOxygen: oxygen }),
    seasonalContext: nullable(object({ unit: { enum: ['ft','cfs'] }, parameterCode: string, percentile: number, band: { enum: ['much_lower','lower','normal','higher','much_higher'] }, yearsOfRecord: nullableNumber, asOf: time })),
    seasonalContextUnavailableReason: nullableString,
    historyCapabilities: object({ maxInstantDays: number, supportsDaily: boolean, supportsCustomRange: boolean }),
    publicUrl: nullableString, stationNote: nullableString,
  }),
  GaugeDetailResponse: object({ gauge: ref('GaugeDetail') }),
  GaugeHistoryResponse: object({ siteId: string, siteName: string, readings: array(ref('GaugeReading')), observedThrough: nullableTime, sampled: boolean,
    typical: array(object({ date: { type: 'string', format: 'date' }, p25Cfs: nullableNumber, p50Cfs: nullableNumber, p75Cfs: nullableNumber, yearsOfRecord: nullableNumber })),
    seasonalRange: array(object({ date: { type: 'string', format: 'date' }, unit: { enum: ['ft','cfs'] }, p25: nullableNumber, p50: nullableNumber, p75: nullableNumber, yearsOfRecord: nullableNumber })),
    forecast: array(object({ timestamp: time, gaugeHeightFt: nullableNumber, dischargeCfs: nullableNumber })), forecastIssuedAt: nullableTime, sourceUrl: nullableString,
    resolution: { enum: ['instant','daily'] }, statistic: { enum: ['instantaneous','daily_mean','daily_selected'] }, requestedWindow: window, coverageWindow: window, coverageComplete: boolean, truncationReason: nullableString,
    stats: object({ minDischarge: nullableNumber, maxDischarge: nullableNumber, minHeight: nullableNumber, maxHeight: nullableNumber }),
  }),
};
const siteParameter = { name: 'siteId', in: 'path', required: true, schema: string, description: 'Provider-native station identifier, e.g. USGS 07019000.' };
const query = (name: string, schema: object, description: string, required = false) => ({ name, in: 'query', required, schema, description });
const response = (schema: string) => ({ description: 'Successful response', content: { 'application/json': { schema: ref(schema) } } });
const error = (description: string) => ({ description, content: { 'application/json': { schema: object({ error: string }) } } });
export const gaugePaths = {
  '/api/gauges': { get: { operationId: 'listGauges', summary: 'List curated gauges and river thresholds', description: 'Returns the curated catalog in a gauges envelope. Use /api/gauges/map for national viewport discovery.', responses: { '200': response('GaugesResponse'), '429': error('Rate limited'), '500': error('Gauge service unavailable') } } },
  '/api/gauges/map': { get: { operationId: 'getMapGauges', summary: 'Find gauges in a bounding box', description: 'Includes historical stations. Use freshness or readingTimestamp to separate historical observations. total counts all matching stations before the result cap; results are curated-first, then discharge.', parameters: [query('bbox', string, 'Required west,south,east,north. Antimeridian-crossing boxes must be split.', true), query('limit', { type: 'integer', minimum: 1, maximum: 1000, default: 300 }, 'Maximum returned gauges.'), query('curated', { enum: ['0','1'], default: '0' }, 'Set to 1 for curated stations only.')], responses: { '200': response('MapGaugesResponse'), '400': error('Invalid bounding box'), '429': error('Rate limited'), '503': error('Gauge map temporarily unavailable') } } },
  '/api/gauges/{siteId}': { get: { operationId: 'getGaugeDetail', summary: 'Get any national or curated gauge', parameters: [siteParameter], responses: { '200': response('GaugeDetailResponse'), '404': error('Unknown station'), '429': error('Rate limited'), '500': error('Gauge service unavailable') } } },
  '/api/gauges/{siteId}/history': { get: { operationId: 'getGaugeHistory', summary: 'Get observed history, seasonal context and official forecast', parameters: [siteParameter, query('days', { type: 'integer', minimum: 1, maximum: 366, default: 7 }, 'Relative window. Provider capability limits apply; inspect coverage metadata.'), query('from', time, 'Explicit window start; takes precedence over days.'), query('to', time, 'Explicit window end; requires from. Defaults to now.'), query('resolution', { enum: ['auto','instant','daily'], default: 'auto' }, 'auto selects daily history for longer windows when supported.')], responses: { '200': response('GaugeHistoryResponse'), '400': error('Invalid or unsupported window/resolution'), '404': error('No history or forecast available'), '429': error('Rate limited'), '500': error('Gauge history service unavailable') } } },
};
