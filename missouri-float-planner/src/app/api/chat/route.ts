// src/app/api/chat/route.ts
// POST /api/chat - Eddy AI Assistant chat endpoint
// Uses Claude with tool use to answer float trip questions with real-time data

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { fetchGaugeReadings } from '@/lib/usgs/gauges';
import { computeCondition, getConditionShortLabel } from '@/lib/conditions';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // Allow up to 30s for LLM + tool calls

// System prompt from EDDY_AI_SPEC.md
const SYSTEM_PROMPT = `You are Eddy, the AI float trip assistant for the Eddy app — a Missouri Ozarks river trip planner.

IDENTITY:
- You are named after the river feature (an eddy: a calm area of water behind an obstruction).
- You help people plan float trips on 8 Missouri rivers: Meramec, Current, Eleven Point, Jacks Fork, Niangua, Big Piney, Huzzah Creek, and Courtois Creek.
- You speak like a knowledgeable local river guide — friendly, direct, and practical.

CORE BEHAVIOR:
- Always ground your answers in real data. When discussing conditions, cite the actual gauge height, condition code, and reading time.
- If data is stale (reading older than 6 hours), warn the user.
- If a river is at "dangerous" or "too_low" level, lead with that information clearly.
- Never recommend floating in dangerous conditions. Be direct: "The Jacks Fork is at flood stage (8.2 ft). Do not float today."
- When recommending trips, factor in: current conditions, river difficulty, user's vessel type, and desired trip length.
- Keep responses concise. Lead with the answer, then supporting details. Bullet points over paragraphs.
- Use river terminology naturally: put-in, take-out, gauge, stage, CFS, gravel bar, riffle, shuttle.

SAFETY DISCLAIMER:
- Always include a brief safety note when discussing specific trip plans: "Always confirm conditions with local outfitters before heading out. Water levels can change rapidly."
- For dangerous conditions, be unambiguous. Do not soften the message.

WHAT YOU DON'T DO:
- You don't book shuttles or rentals. You can share outfitter info if available.
- You don't provide legal advice about river access or property rights.
- You don't make up data. If a gauge reading is unavailable, say "I don't have current data for that gauge."

RESPONSE FORMAT:
- Use short paragraphs and bullet points.
- For condition checks, use this format:
  **[River Name]** — [Condition Label]
  - Stage: [X.XX] ft | Flow: [X,XXX] cfs
  - Reading: [time ago]
  - [Any warnings]

- For trip recommendations, use this format:
  **[Put-in]** → **[Take-out]**
  - Distance: [X.X] mi
  - Est. float time: [X hrs X min] ([vessel type])
  - Shuttle drive: [X min]
  - Current conditions: [label]

TONE:
- Good: "The Current River at Akers Ferry is running at 3.4 ft — right in the sweet spot. Optimal conditions for a float today."
- Good: "Huzzah Creek is pretty low right now (1.1 ft). You'll be dragging in spots. If you don't mind some walking, it's still doable in a canoe."
- Good: "I'd skip the Jacks Fork today. The gauge at Eminence is reading 11.2 ft — that's well into flood territory. Check back in a few days."
- Bad: "Based on my analysis of the current hydrological data..." (too formal)`;

// Tool definitions for Claude
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_river_conditions',
    description: 'Get current water conditions for a specific river or all rivers. Returns live USGS gauge data including gauge height, discharge (CFS), condition rating, and reading freshness.',
    input_schema: {
      type: 'object' as const,
      properties: {
        river_slug: {
          type: 'string',
          description: 'River slug (e.g., "current-river", "meramec-river"). Omit for all rivers.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_access_points',
    description: 'Get access points (put-in/take-out locations) for a specific river. Returns name, type, amenities, fees, river mile, and coordinates.',
    input_schema: {
      type: 'object' as const,
      properties: {
        river_slug: {
          type: 'string',
          description: 'River slug (e.g., "current-river")',
        },
      },
      required: ['river_slug'],
    },
  },
  {
    name: 'calculate_float_plan',
    description: 'Calculate a complete float plan between two access points. Returns distance, estimated float time, shuttle drive time, current conditions, and hazards along the route.',
    input_schema: {
      type: 'object' as const,
      properties: {
        river_slug: {
          type: 'string',
          description: 'River slug (e.g., "current-river")',
        },
        start_access_name: {
          type: 'string',
          description: 'Name of the put-in access point (e.g., "Baptist Camp")',
        },
        end_access_name: {
          type: 'string',
          description: 'Name of the take-out access point (e.g., "Akers Ferry")',
        },
        vessel_type: {
          type: 'string',
          description: 'Vessel type slug: kayak, canoe, tube, or raft. Default: canoe.',
        },
      },
      required: ['river_slug', 'start_access_name', 'end_access_name'],
    },
  },
  {
    name: 'get_river_hazards',
    description: 'Get known hazards along a river or between two river miles. Returns hazard type, severity, portage requirements, and descriptions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        river_slug: {
          type: 'string',
          description: 'River slug (e.g., "current-river")',
        },
        start_mile: {
          type: 'number',
          description: 'Start river mile (optional, for filtering a segment)',
        },
        end_mile: {
          type: 'number',
          description: 'End river mile (optional, for filtering a segment)',
        },
      },
      required: ['river_slug'],
    },
  },
];

// Tool handler: get conditions for one or all rivers
async function handleGetRiverConditions(args: { river_slug?: string }) {
  const supabase = await createClient();

  // Get rivers (all or filtered)
  let riverQuery = supabase
    .from('rivers')
    .select('id, name, slug, length_miles, difficulty_rating, region')
    .eq('active', true)
    .order('name');

  if (args.river_slug) {
    riverQuery = riverQuery.eq('slug', args.river_slug);
  }

  const { data: rivers, error: riverError } = await riverQuery;
  if (riverError || !rivers || rivers.length === 0) {
    return { error: args.river_slug ? `River "${args.river_slug}" not found` : 'No rivers found' };
  }

  const results = [];

  for (const river of rivers) {
    // Get primary gauge with thresholds
    const { data: gaugeData } = await supabase
      .from('river_gauges')
      .select(`
        threshold_unit,
        level_too_low, level_low, level_optimal_min, level_optimal_max,
        level_high, level_dangerous,
        gauge_stations!inner (id, name, usgs_site_id, active)
      `)
      .eq('river_id', river.id)
      .eq('is_primary', true)
      .limit(1)
      .maybeSingle();

    if (!gaugeData) {
      results.push({
        river: river.name,
        slug: river.slug,
        condition: 'unknown',
        message: 'No gauge data available',
      });
      continue;
    }

    const gaugeStation = Array.isArray(gaugeData.gauge_stations)
      ? gaugeData.gauge_stations[0]
      : gaugeData.gauge_stations;

    if (!gaugeStation?.usgs_site_id) {
      results.push({
        river: river.name,
        slug: river.slug,
        condition: 'unknown',
        message: 'No USGS gauge linked',
      });
      continue;
    }

    // Fetch live USGS reading
    const readings = await fetchGaugeReadings([gaugeStation.usgs_site_id]);
    const reading = readings.find(r => r.siteId === gaugeStation.usgs_site_id);

    if (!reading) {
      results.push({
        river: river.name,
        slug: river.slug,
        gaugeName: gaugeStation.name,
        condition: 'unknown',
        message: 'Could not fetch USGS reading',
      });
      continue;
    }

    // Compute condition
    const condition = computeCondition(
      reading.gaugeHeightFt,
      {
        levelTooLow: gaugeData.level_too_low,
        levelLow: gaugeData.level_low,
        levelOptimalMin: gaugeData.level_optimal_min,
        levelOptimalMax: gaugeData.level_optimal_max,
        levelHigh: gaugeData.level_high,
        levelDangerous: gaugeData.level_dangerous,
        thresholdUnit: gaugeData.threshold_unit as 'ft' | 'cfs' | undefined,
      },
      reading.dischargeCfs
    );

    const readingAgeHours = reading.readingTimestamp
      ? (Date.now() - new Date(reading.readingTimestamp).getTime()) / (1000 * 60 * 60)
      : null;

    results.push({
      river: river.name,
      slug: river.slug,
      lengthMiles: river.length_miles,
      difficulty: river.difficulty_rating,
      gaugeName: gaugeStation.name,
      gaugeHeightFt: reading.gaugeHeightFt,
      dischargeCfs: reading.dischargeCfs,
      conditionCode: condition.code,
      conditionLabel: getConditionShortLabel(condition.code),
      readingAge: readingAgeHours !== null ? `${Math.round(readingAgeHours * 10) / 10} hours ago` : 'unknown',
      staleData: readingAgeHours !== null && readingAgeHours > 6,
    });
  }

  return { rivers: results };
}

// Tool handler: get access points for a river
async function handleGetAccessPoints(args: { river_slug: string }) {
  const supabase = await createClient();

  const { data: river } = await supabase
    .from('rivers')
    .select('id, name')
    .eq('slug', args.river_slug)
    .single();

  if (!river) {
    return { error: `River "${args.river_slug}" not found` };
  }

  const { data: accessPoints, error } = await supabase
    .from('access_points')
    .select('id, name, slug, type, types, river_mile_downstream, is_public, ownership, description, parking_info, fee_required, amenities')
    .eq('river_id', river.id)
    .eq('approved', true)
    .order('river_mile_downstream', { ascending: true });

  if (error) {
    return { error: 'Could not fetch access points' };
  }

  return {
    river: river.name,
    accessPoints: (accessPoints || []).map(ap => ({
      id: ap.id,
      name: ap.name,
      type: ap.types?.[0] || ap.type || 'access',
      riverMile: ap.river_mile_downstream ? parseFloat(ap.river_mile_downstream) : null,
      isPublic: ap.is_public,
      ownership: ap.ownership,
      description: ap.description,
      parkingInfo: ap.parking_info,
      feeRequired: ap.fee_required,
    })),
  };
}

// Tool handler: calculate float plan
async function handleCalculateFloatPlan(args: {
  river_slug: string;
  start_access_name: string;
  end_access_name: string;
  vessel_type?: string;
}) {
  const supabase = await createClient();

  // Look up river
  const { data: river } = await supabase
    .from('rivers')
    .select('id, name')
    .eq('slug', args.river_slug)
    .single();

  if (!river) {
    return { error: `River "${args.river_slug}" not found` };
  }

  // Find access points by name (fuzzy match)
  const { data: allAPs } = await supabase
    .from('access_points')
    .select('id, name, river_mile_downstream')
    .eq('river_id', river.id)
    .eq('approved', true);

  if (!allAPs || allAPs.length === 0) {
    return { error: 'No access points found for this river' };
  }

  // Fuzzy match access point names
  const findAP = (searchName: string) => {
    const lower = searchName.toLowerCase();
    return allAPs.find(ap => ap.name.toLowerCase().includes(lower))
      || allAPs.find(ap => lower.includes(ap.name.toLowerCase()));
  };

  const startAP = findAP(args.start_access_name);
  const endAP = findAP(args.end_access_name);

  if (!startAP) {
    return {
      error: `Could not find put-in "${args.start_access_name}". Available: ${allAPs.map(a => a.name).join(', ')}`,
    };
  }
  if (!endAP) {
    return {
      error: `Could not find take-out "${args.end_access_name}". Available: ${allAPs.map(a => a.name).join(', ')}`,
    };
  }

  // Look up vessel type
  let vesselTypeId: string | undefined;
  if (args.vessel_type) {
    const { data: vt } = await supabase
      .from('vessel_types')
      .select('id')
      .eq('slug', args.vessel_type)
      .single();
    vesselTypeId = vt?.id;
  }

  // Call the plan API internally via fetch (reuses all existing logic)
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const planParams = new URLSearchParams({
    riverId: river.id,
    startId: startAP.id,
    endId: endAP.id,
  });
  if (vesselTypeId) planParams.set('vesselTypeId', vesselTypeId);

  try {
    const planResponse = await fetch(`${baseUrl}/api/plan?${planParams.toString()}`, {
      headers: { Cookie: '' }, // Server-side call
    });

    if (!planResponse.ok) {
      return { error: 'Could not calculate float plan' };
    }

    const planData = await planResponse.json();
    const plan = planData.plan;

    return {
      river: plan.river.name,
      putIn: plan.putIn.name,
      takeOut: plan.takeOut.name,
      vessel: plan.vessel.name,
      distance: plan.distance.formatted,
      floatTime: plan.floatTime?.formatted || 'Unknown',
      isEstimate: plan.floatTime?.isEstimate ?? true,
      shuttleDrive: plan.driveBack.formatted,
      shuttleDistance: `${Math.round(plan.driveBack.miles * 10) / 10} mi`,
      condition: {
        label: plan.condition.label,
        code: plan.condition.code,
        gaugeHeightFt: plan.condition.gaugeHeightFt,
        dischargeCfs: plan.condition.dischargeCfs,
        flowDescription: plan.condition.flowDescription,
      },
      hazards: plan.hazards.map((h: { name: string; severity: string; portageRequired: boolean; description: string }) => ({
        name: h.name,
        severity: h.severity,
        portageRequired: h.portageRequired,
        description: h.description,
      })),
      warnings: plan.warnings,
    };
  } catch {
    return { error: 'Failed to calculate float plan. The plan API may be unavailable.' };
  }
}

// Tool handler: get river hazards
async function handleGetRiverHazards(args: {
  river_slug: string;
  start_mile?: number;
  end_mile?: number;
}) {
  const supabase = await createClient();

  const { data: river } = await supabase
    .from('rivers')
    .select('id, name')
    .eq('slug', args.river_slug)
    .single();

  if (!river) {
    return { error: `River "${args.river_slug}" not found` };
  }

  let query = supabase
    .from('river_hazards')
    .select('name, type, severity, description, portage_required, portage_side, seasonal_notes, river_mile_downstream')
    .eq('river_id', river.id)
    .eq('active', true)
    .order('river_mile_downstream', { ascending: true });

  if (args.start_mile !== undefined && args.end_mile !== undefined) {
    const minMile = Math.min(args.start_mile, args.end_mile);
    const maxMile = Math.max(args.start_mile, args.end_mile);
    query = query.gte('river_mile_downstream', minMile).lte('river_mile_downstream', maxMile);
  }

  const { data: hazards, error } = await query;

  if (error) {
    return { error: 'Could not fetch hazards' };
  }

  return {
    river: river.name,
    hazards: (hazards || []).map(h => ({
      name: h.name,
      type: h.type,
      severity: h.severity,
      description: h.description,
      portageRequired: h.portage_required,
      portageSide: h.portage_side,
      seasonalNotes: h.seasonal_notes,
      riverMile: h.river_mile_downstream ? parseFloat(h.river_mile_downstream) : null,
    })),
    total: hazards?.length || 0,
  };
}

// Execute a tool call
async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_river_conditions':
      return handleGetRiverConditions(input as { river_slug?: string });
    case 'get_access_points':
      return handleGetAccessPoints(input as { river_slug: string });
    case 'calculate_float_plan':
      return handleCalculateFloatPlan(input as {
        river_slug: string;
        start_access_name: string;
        end_access_name: string;
        vessel_type?: string;
      });
    case 'get_river_hazards':
      return handleGetRiverHazards(input as {
        river_slug: string;
        start_mile?: number;
        end_mile?: number;
      });
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 20 chat messages per IP per minute
    const rateLimitResult = rateLimit(`chat:${getClientIp(request)}`, 20, 60 * 1000);
    if (rateLimitResult) return rateLimitResult;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'AI assistant is not configured' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { messages, context } = body as {
      messages: ChatMessage[];
      context?: { riverSlug?: string; riverName?: string };
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400 }
      );
    }

    // Limit conversation length
    if (messages.length > 50) {
      return NextResponse.json(
        { error: 'Conversation too long. Please start a new conversation.' },
        { status: 400 }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    // Build system prompt with optional context
    let systemPrompt = SYSTEM_PROMPT;
    if (context?.riverSlug) {
      systemPrompt += `\n\nCONTEXT: The user is currently viewing the ${context.riverName || context.riverSlug} page. When they ask about conditions or planning without specifying a river, assume they mean ${context.riverName || context.riverSlug}.`;
    }

    // Convert messages to Anthropic format
    const anthropicMessages: Anthropic.MessageParam[] = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Initial Claude call with tools
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages: anthropicMessages,
    });

    // Handle tool use loop (up to 5 rounds)
    let rounds = 0;
    const maxRounds = 5;

    while (response.stop_reason === 'tool_use' && rounds < maxRounds) {
      rounds++;

      // Collect all tool use blocks
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      // Execute all tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        const result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      // Continue conversation with tool results
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOLS,
        messages: [
          ...anthropicMessages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ],
      });
    }

    // Extract text response
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    const assistantMessage = textBlocks.map(b => b.text).join('\n') || 'I wasn\'t able to process that request. Could you try rephrasing?';

    return NextResponse.json({
      message: assistantMessage,
      toolsUsed: rounds > 0,
    });
  } catch (error) {
    console.error('[Chat API] Error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
