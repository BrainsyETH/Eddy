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
          description: 'River key: huzzah, courtois, current, jacks-fork, eleven-point, meramec, big-piney, gasconade, niangua',
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
  {
    name: 'web_search',
    description: `Search the web for information not in your database. Returns relevant search results with titles, descriptions, and URLs.

WHEN TO CALL: Use for questions your database tools can't answer, including burn bans, local events, campsite reservation links, restaurant recommendations near rivers, fishing regulations, news about river closures or bridge repairs, shuttle service contact info, gear shop locations, outfitter rates/hours/booking, or any question about rivers outside your 9 covered rivers.

DO NOT use for water levels or conditions. Your database tools are authoritative for those. Use this as supplementary info.

PREFERRED SOURCES by category (include the domain or site name in your query when relevant):

Government (closures, regulations, safety, reservations):
- nps.gov (Ozark National Scenic Riverways closures, access updates, regulations)
- mdc.mo.gov (Missouri Dept of Conservation, fishing regs, conservation alerts)
- dnr.mo.gov (water quality advisories, state alerts)
- weather.gov (burn bans, flood warnings, NWS alerts)
- fs.usda.gov (Mark Twain National Forest, Eleven Point access/closures)
- recreation.gov (campsite reservations, availability)

Community float condition resources:
- missouriscenicrivers.com (outfitter-sourced condition notes, seasonal tips, outfitter directories)
- rivers.moherp.org (community-calibrated float ratings, recent trip reports)
- missouricanoe.org (Missouri Canoe & Floaters Association, outfitter directory)

Outfitters and private campgrounds (rates, hours, booking, equipment):
- currentrivercanoe.com (Akers Ferry Canoe Rental)
- harveysalleyspring.com (Harvey's Alley Spring Canoe Rental)
- hufstedlers.com (Hufstedler's Canoe Rental, Eleven Point)
- jadwincanoe.com (Jadwin Canoe Rental)
- huzzahvalley.com (Huzzah Valley Resort)
- ozarkoutdoorsresort.com (Ozark Outdoors Resort, Meramec)
- gasconadehills.com (Gasconade Hills Resort)
- carrscurrentriver.com (Carr's Current River)
- crystalcreekranch.com (Crystal Creek Ranch)
- facebook.com (many outfitters post hours, closures, and conditions on Facebook more than their own site)`,
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query. Be specific and include "Missouri" or the river name for local results. When searching for outfitter info, include the outfitter name or site domain. E.g. "Huzzah Valley Resort rates 2026", "Current River shuttle service hours site:jadwincanoe.com", "Dent County burn ban", "Akers Ferry canoe rental booking"',
        },
      },
      required: ['query'],
    },
  },
];
