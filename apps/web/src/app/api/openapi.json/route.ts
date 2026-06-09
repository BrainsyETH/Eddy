import { NextResponse } from 'next/server';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Eddy - Missouri Float Trip API',
    description:
      'Public API for Missouri Ozarks float trip data including rivers, access points, real-time water conditions from USGS gauges, hazards, float planning, weather, and more. AI agents accessing these endpoints programmatically should use the x402 payment protocol — see /.well-known/x402 for pricing.',
    version: '1.0.0',
    contact: { name: 'Eddy', url: BASE_URL },
  },
  servers: [{ url: BASE_URL, description: 'Production' }],
  paths: {
    '/api/rivers': {
      get: {
        operationId: 'listRivers',
        summary: 'List all active float rivers',
        description: 'Returns all active rivers with their current water conditions.',
        responses: {
          '200': {
            description: 'Array of rivers with conditions',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RiversResponse' },
              },
            },
          },
        },
      },
    },
    '/api/rivers/{slug}': {
      get: {
        operationId: 'getRiver',
        summary: 'Get river details with GeoJSON geometry',
        parameters: [
          {
            name: 'slug',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'River URL slug (e.g., "current-river")',
          },
        ],
        responses: {
          '200': {
            description: 'River details including geometry and bounds',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RiverDetail' },
              },
            },
          },
          '404': { description: 'River not found' },
        },
      },
    },
    '/api/rivers/{slug}/access-points': {
      get: {
        operationId: 'getRiverAccessPoints',
        summary: 'Get all access points for a river',
        description: 'Returns approved access points with coordinates, amenities, parking, and facilities.',
        parameters: [
          {
            name: 'slug',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'River URL slug',
          },
        ],
        responses: {
          '200': {
            description: 'Array of access points',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/AccessPoint' },
                },
              },
            },
          },
        },
      },
    },
    '/api/rivers/{slug}/hazards': {
      get: {
        operationId: 'getRiverHazards',
        summary: 'Get active hazards for a river',
        description: 'Returns dams, rapids, strainers, and other hazards with severity and portage info.',
        parameters: [
          {
            name: 'slug',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Array of hazards',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Hazard' },
                },
              },
            },
          },
        },
      },
    },
    '/api/rivers/{slug}/pois': {
      get: {
        operationId: 'getRiverPOIs',
        summary: 'Get points of interest for a river',
        description: 'Returns scenic spots, springs, caves, and other points of interest.',
        parameters: [
          {
            name: 'slug',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Array of points of interest',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/PointOfInterest' },
                },
              },
            },
          },
        },
      },
    },
    '/api/rivers/{slug}/services': {
      get: {
        operationId: 'getRiverServices',
        summary: 'Get nearby services for a river',
        description: 'Returns outfitters, campgrounds, and shuttle services near the river.',
        parameters: [
          {
            name: 'slug',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Array of services',
            content: { 'application/json': { schema: { type: 'array' } } },
          },
        },
      },
    },
    '/api/conditions/{riverId}': {
      get: {
        operationId: 'getRiverConditions',
        summary: 'Get current water conditions for a river',
        description:
          'Returns condition code (good/flowing/low/high/dangerous), gauge height, discharge CFS, trend, and reading age. Optionally pass putInAccessPointId for segment-aware gauge selection.',
        parameters: [
          {
            name: 'riverId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'River UUID',
          },
          {
            name: 'putInAccessPointId',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'uuid' },
            description: 'Put-in access point ID for segment-aware gauge selection',
          },
        ],
        responses: {
          '200': {
            description: 'Current river condition',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RiverCondition' },
              },
            },
          },
        },
      },
    },
    '/api/gauges': {
      get: {
        operationId: 'listGauges',
        summary: 'List all gauge stations with current readings',
        description:
          'Returns USGS gauge stations with latest water level readings, discharge, and threshold definitions.',
        responses: {
          '200': {
            description: 'Array of gauge stations',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/GaugeStation' },
                },
              },
            },
          },
        },
      },
    },
    '/api/gauges/{siteId}/history': {
      get: {
        operationId: 'getGaugeHistory',
        summary: 'Get gauge reading history',
        parameters: [
          {
            name: 'siteId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'USGS site ID (e.g., "07019000")',
          },
        ],
        responses: {
          '200': {
            description: 'Array of historical gauge readings',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/GaugeReading' },
                },
              },
            },
          },
        },
      },
    },
    '/api/plan': {
      get: {
        operationId: 'calculateFloatPlan',
        summary: 'Calculate a complete float plan',
        description:
          'Calculates distance, float time, drive-back time, conditions, hazards, and route geometry between two access points.',
        parameters: [
          {
            name: 'riverId',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'startId',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Put-in access point ID',
          },
          {
            name: 'endId',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Take-out access point ID',
          },
          {
            name: 'vesselTypeId',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'uuid' },
            description: 'Vessel type ID (defaults to canoe)',
          },
        ],
        responses: {
          '200': {
            description: 'Complete float plan',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FloatPlan' },
              },
            },
          },
        },
      },
    },
    '/api/vessel-types': {
      get: {
        operationId: 'listVesselTypes',
        summary: 'List vessel types with speed profiles',
        description: 'Returns canoe, kayak, tube, raft, etc. with speed at low/normal/high water.',
        responses: {
          '200': {
            description: 'Array of vessel types',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/VesselType' },
                },
              },
            },
          },
        },
      },
    },
    '/api/weather/{riverSlug}': {
      get: {
        operationId: 'getRiverWeather',
        summary: 'Get current weather for a river',
        parameters: [
          {
            name: 'riverSlug',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Current weather data',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        },
      },
    },
    '/api/weather/{riverSlug}/forecast': {
      get: {
        operationId: 'getRiverWeatherForecast',
        summary: 'Get weather forecast for a river',
        parameters: [
          {
            name: 'riverSlug',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Weather forecast',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        },
      },
    },
    '/api/blog': {
      get: {
        operationId: 'listBlogPosts',
        summary: 'List published blog posts',
        responses: {
          '200': {
            description: 'Array of blog post summaries',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/BlogPostSummary' },
                },
              },
            },
          },
        },
      },
    },
    '/api/blog/{slug}': {
      get: {
        operationId: 'getBlogPost',
        summary: 'Get full blog post content',
        parameters: [
          {
            name: 'slug',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Full blog post with content',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          '404': { description: 'Blog post not found' },
        },
      },
    },
  },
  components: {
    schemas: {
      RiversResponse: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            slug: { type: 'string' },
            lengthMiles: { type: 'number' },
            description: { type: ['string', 'null'] },
            difficultyRating: { type: ['string', 'null'] },
            region: { type: ['string', 'null'] },
            condition: { $ref: '#/components/schemas/RiverCondition' },
          },
        },
      },
      RiverDetail: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          slug: { type: 'string' },
          lengthMiles: { type: 'number' },
          description: { type: ['string', 'null'] },
          difficultyRating: { type: ['string', 'null'] },
          region: { type: ['string', 'null'] },
          geometry: {
            type: 'object',
            description: 'GeoJSON LineString of the river centerline',
          },
          bounds: {
            type: 'array',
            items: { type: 'number' },
            description: '[minLng, minLat, maxLng, maxLat]',
          },
        },
      },
      AccessPoint: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          slug: { type: 'string' },
          riverMile: { type: 'number' },
          type: {
            type: 'string',
            enum: ['boat_ramp', 'gravel_bar', 'campground', 'bridge', 'access', 'park'],
          },
          isPublic: { type: 'boolean' },
          description: { type: ['string', 'null'] },
          amenities: { type: 'array', items: { type: 'string' } },
          parkingInfo: { type: ['string', 'null'] },
          feeRequired: { type: 'boolean' },
          coordinates: {
            type: 'object',
            properties: {
              lng: { type: 'number' },
              lat: { type: 'number' },
            },
          },
          managingAgency: { type: ['string', 'null'] },
        },
      },
      RiverCondition: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Human-readable label (e.g., "Optimal for floating")' },
          code: {
            type: 'string',
            enum: ['good', 'flowing', 'low', 'too_low', 'high', 'dangerous', 'unknown'],
          },
          gaugeHeightFt: { type: ['number', 'null'] },
          dischargeCfs: { type: ['number', 'null'] },
          readingTimestamp: { type: ['string', 'null'], format: 'date-time' },
          readingAgeHours: { type: ['number', 'null'] },
          gaugeName: { type: ['string', 'null'] },
          gaugeUsgsId: { type: ['string', 'null'] },
          percentile: { type: ['number', 'null'], description: 'Percentile vs historical data (0-100)' },
        },
      },
      Hazard: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          type: {
            type: 'string',
            enum: [
              'low_water_dam', 'portage', 'strainer', 'rapid',
              'private_property', 'waterfall', 'shoal', 'bridge_piling', 'other',
            ],
          },
          riverMile: { type: 'number' },
          description: { type: ['string', 'null'] },
          severity: { type: 'string', enum: ['info', 'caution', 'warning', 'danger'] },
          portageRequired: { type: 'boolean' },
          portageSide: { type: ['string', 'null'], enum: ['left', 'right', 'either', null] },
          coordinates: {
            type: 'object',
            properties: { lng: { type: 'number' }, lat: { type: 'number' } },
          },
        },
      },
      PointOfInterest: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          type: { type: 'string' },
          description: { type: ['string', 'null'] },
          riverMile: { type: ['number', 'null'] },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          amenities: { type: 'array', items: { type: 'string' } },
        },
      },
      GaugeStation: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          usgsSiteId: { type: 'string' },
          name: { type: 'string' },
          latestReading: {
            type: 'object',
            properties: {
              gaugeHeightFt: { type: ['number', 'null'] },
              dischargeCfs: { type: ['number', 'null'] },
              readingTimestamp: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      GaugeReading: {
        type: 'object',
        properties: {
          gaugeHeightFt: { type: ['number', 'null'] },
          dischargeCfs: { type: ['number', 'null'] },
          readingTimestamp: { type: 'string', format: 'date-time' },
        },
      },
      FloatPlan: {
        type: 'object',
        properties: {
          river: { $ref: '#/components/schemas/RiverDetail' },
          putIn: { $ref: '#/components/schemas/AccessPoint' },
          takeOut: { $ref: '#/components/schemas/AccessPoint' },
          distance: {
            type: 'object',
            properties: {
              miles: { type: 'number' },
              formatted: { type: 'string' },
            },
          },
          floatTime: {
            type: ['object', 'null'],
            properties: {
              minutes: { type: 'number' },
              formatted: { type: 'string' },
              speedMph: { type: 'number' },
            },
          },
          driveBack: {
            type: 'object',
            properties: {
              minutes: { type: 'number' },
              miles: { type: 'number' },
              formatted: { type: 'string' },
            },
          },
          condition: { $ref: '#/components/schemas/RiverCondition' },
          hazards: { type: 'array', items: { $ref: '#/components/schemas/Hazard' } },
          warnings: { type: 'array', items: { type: 'string' } },
        },
      },
      VesselType: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          slug: { type: 'string' },
          description: { type: 'string' },
          icon: { type: 'string' },
          speeds: {
            type: 'object',
            properties: {
              lowWater: { type: 'number', description: 'mph at low water' },
              normal: { type: 'number', description: 'mph at normal water' },
              highWater: { type: 'number', description: 'mph at high water' },
            },
          },
        },
      },
      BlogPostSummary: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          featuredImageUrl: { type: ['string', 'null'] },
          readTimeMinutes: { type: 'number' },
          publishedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
};

export async function GET() {
  return NextResponse.json(spec, {
    headers: {
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
