// src/lib/chat/tools.ts
// Anthropic tool definitions for Eddy chat.
// Claude reads these descriptions to decide WHEN and HOW to call each tool.

import type Anthropic from '@anthropic-ai/sdk';

export const EDDY_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_river_conditions',
    description: `Check current floating conditions for a Missouri river. Returns the live gauge reading, calibrated condition (too_low / low / okay / optimal / high / dangerous), what that level means for floating, and recent trend.

WHEN TO CALL: Any time the user asks about current conditions, whether they can float, or anything involving water levels. Always call this BEFORE recommending floating. Never guess at conditions.

If the result shows "high" or "dangerous", lead your response with a clear safety warning.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        river_slug: {
          type: 'string',
          description: 'River key: huzzah, courtois, current, jacks-fork, eleven-point, meramec, big-piney, gasconade',
        },
      },
      required: ['river_slug'],
    },
  },
  {
    name: 'get_access_points',
    description: `Get access points (put-ins and take-outs) for a river. Returns names, types, amenities, parking info, road access, and coordinates.

WHEN TO CALL: When the user asks where to put in, take out, or park. Also useful for listing options on a river.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        river_slug: {
          type: 'string',
          description: 'River key',
        },
      },
      required: ['river_slug'],
    },
  },
  {
    name: 'get_float_route',
    description: `Calculate a float route between two access points. Returns distance, estimated float time, shuttle drive time, and hazards along the way.

WHEN TO CALL: When the user asks "how long does X to Y take?", "how far is it?", or wants to plan a specific section. Always include concrete distance and time when recommending sections.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        river_slug: {
          type: 'string',
          description: 'River key',
        },
        start_point: {
          type: 'string',
          description: 'Starting access point name or description, e.g. "Akers Ferry", "Hwy 8 Bridge"',
        },
        end_point: {
          type: 'string',
          description: 'Ending access point name or description',
        },
      },
      required: ['river_slug', 'start_point', 'end_point'],
    },
  },
  {
    name: 'get_river_hazards',
    description: `Get active hazards on a river — strainers, low-water bridges, rapids, logjams, etc. Returns type, severity, location, and portage info.

WHEN TO CALL: When planning a trip or when the user asks about safety on a specific river. Also call when recommending sections to mention relevant hazards.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        river_slug: {
          type: 'string',
          description: 'River key',
        },
      },
      required: ['river_slug'],
    },
  },
  {
    name: 'get_weather',
    description: `Get current weather, 3-day forecast, and active NWS alerts for a river area. Returns temperature, conditions, wind, precipitation chance, and any flood/storm warnings.

WHEN TO CALL: Always call alongside get_river_conditions for go/no-go decisions. Also call for any planning question involving specific dates.

If there are active flood watches or flash flood warnings, mention them prominently.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        river_slug: {
          type: 'string',
          description: 'River key',
        },
      },
      required: ['river_slug'],
    },
  },
  {
    name: 'get_nearby_services',
    description: `Find outfitters, campgrounds, cabins, and lodging near a river. Returns contact info, services offered, and descriptions.

WHEN TO CALL: When the user asks about outfitters, canoe rentals, shuttle services, camping, or lodging near a river.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        river_slug: {
          type: 'string',
          description: 'River key',
        },
        category: {
          type: 'string',
          enum: ['camping', 'lodging', 'outfitter'],
          description: 'Optional filter by service category',
        },
      },
      required: ['river_slug'],
    },
  },
];
