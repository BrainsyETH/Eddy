# Eddy Chat Redesign — Full Spec

## Executive Summary

The current Eddy chat implementation works but has critical bugs (slug mismatch, no context passing), missing capabilities (no weather, no POIs, no local knowledge, no streaming), and architectural limitations (blocking responses, no river-specific intelligence). This redesign fixes all of that.

---

## 1. Problems With Current Implementation

### 1.1 Bugs

| Bug | Impact | Location |
|-----|--------|----------|
| **Slug mismatch** | Tool descriptions say `"current-river"` but DB slugs are `"current"`, `"meramec"`, etc. Claude generates wrong slugs and every tool call fails. | `route.ts:72` |
| **No context passing** | ChatPanel is mounted in `layout.tsx:105` with no props — `<ChatPanel />`. riverSlug/riverName are never passed. Eddy doesn't know which river page you're on. | `layout.tsx:105` |
| **Full conversation replay** | Every message sends the entire conversation history to the API, which re-sends it all to Claude. No token management = will hit context limits on longer chats. | `useChat.ts:53` |

### 1.2 Missing Capabilities

| Missing | Why it matters |
|---------|---------------|
| **Weather tool** | Weather API already exists (`/api/weather/[riverSlug]`) with OpenWeatherMap integration, 5-day forecast, etc. — but Eddy can't access it. |
| **Local knowledge** | River-specific intel exists in `LocalKnowledge.tsx` (optimal ranges, closure thresholds, tips) — but Eddy doesn't know any of it. |
| **POI data** | `usePOIs` hook and `PointsOfInterest` component exist — but Eddy can't search for campgrounds, springs, landmarks. |
| **Streaming** | Users wait 3-8 seconds staring at "Eddy is thinking..." with no incremental feedback. The spec says streaming should be used. |
| **Plan context** | When a user has a put-in/take-out selected on the river page, Eddy doesn't know about it. |
| **Deep links** | Eddy can't link to river pages, access points, or plans in responses. |
| **River comparison** | The spec defines a `compare_rivers` tool but it was never implemented. |
| **Markdown rendering** | The `formatMarkdown` function is fragile regex-based HTML injection via `dangerouslySetInnerHTML`. |

### 1.3 Architectural Issues

| Issue | Detail |
|-------|--------|
| **No streaming** | Entire response is computed server-side, then sent as JSON. Tool-use loops can take 5+ seconds with zero user feedback. |
| **Self-fetch for plans** | `handleCalculateFloatPlan` does `fetch(baseUrl/api/plan)` to itself — fragile in production (cold starts, auth issues, localhost fallback). |
| **No slug validation** | Claude can pass any string as `river_slug` — no mapping from natural language ("Current River") to slug ("current"). |
| **Rate limit is IP-only** | No per-session or per-user differentiation. Shared IPs (offices, campgrounds) hit limits fast. |

---

## 2. Redesigned Architecture

### 2.1 Overview

```
┌─────────────────────────────────────────────────────┐
│  Client (ChatPanel)                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ useChat hook │  │ Context      │  │ Streaming │  │
│  │ (messages,   │  │ Provider     │  │ Markdown  │  │
│  │  streaming)  │  │ (river, plan)│  │ Renderer  │  │
│  └──────┬──────┘  └──────┬───────┘  └───────────┘  │
│         │                │                           │
│         ▼                ▼                           │
│  POST /api/chat (streaming SSE)                     │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│  Server (route.ts)                                  │
│                                                     │
│  ┌──────────────────────┐                           │
│  │ System Prompt         │                          │
│  │ + River Context       │ ◄── injected per-request │
│  │ + Local Knowledge     │                          │
│  │ + Slug Map            │                          │
│  └──────────┬───────────┘                           │
│             │                                       │
│             ▼                                       │
│  ┌──────────────────────┐                           │
│  │ Claude API            │                          │
│  │ (streaming + tools)   │                          │
│  └──────────┬───────────┘                           │
│             │                                       │
│      ┌──────┼──────┬──────────┬──────────┐          │
│      ▼      ▼      ▼          ▼          ▼          │
│  conditions access  plan    hazards   weather       │
│  (direct)  (direct) (direct) (direct)  (direct)    │
│                                                     │
│  All tools call Supabase/USGS/OpenWeather directly  │
│  No self-fetch to /api/* routes                     │
└─────────────────────────────────────────────────────┘
```

### 2.2 Key Changes

1. **Streaming SSE** — Response streams token-by-token to the client
2. **River context injection** — When on a river page, inject local knowledge + current conditions + selected plan into the system prompt
3. **Fix slugs** — Add a slug map to tool descriptions + validate/correct slugs before DB queries
4. **Direct DB calls** — Remove self-fetch pattern; all tools call Supabase/USGS/Mapbox directly
5. **New tools** — Weather, POIs, river comparison
6. **Local knowledge in system prompt** — Inject the `RIVER_SUMMARIES` data (thresholds, tips, closure levels) as context when a river is active
7. **Proper markdown** — Use `react-markdown` or a proper parser instead of regex + dangerouslySetInnerHTML

---

## 3. Slug Resolution

### The Problem
The tool descriptions tell Claude to use slugs like `"current-river"`, but the database uses `"current"`. Claude has no way to know the correct format.

### The Fix
Add a **slug map** directly into the system prompt and tool descriptions:

```typescript
const RIVER_SLUG_MAP: Record<string, string> = {
  'current': 'current',
  'meramec': 'meramec',
  'eleven-point': 'eleven-point',
  'jacks-fork': 'jacks-fork',
  'niangua': 'niangua',
  'big-piney': 'big-piney',
  'huzzah': 'huzzah',
  'courtois': 'courtois',
};
```

Inject into system prompt:
```
RIVER SLUGS (use these exact values for tool calls):
- Current River → "current"
- Meramec River → "meramec"
- Eleven Point River → "eleven-point"
- Jacks Fork River → "jacks-fork"
- Niangua River → "niangua"
- Big Piney River → "big-piney"
- Huzzah Creek → "huzzah"
- Courtois Creek → "courtois"
```

Also add **server-side slug normalization** — if Claude sends `"current-river"` or `"Current River"`, normalize it before querying:

```typescript
function normalizeRiverSlug(input: string): string | null {
  const normalized = input.toLowerCase().replace(/[^a-z-]/g, '').replace(/-river$/, '').replace(/-creek$/, '');
  return VALID_SLUGS.includes(normalized) ? normalized : null;
}
```

---

## 4. Context Injection

### 4.1 The Context Provider

Create a React context that tracks the current river page state:

```typescript
// src/context/ChatContext.tsx
interface ChatContextValue {
  riverSlug: string | null;
  riverName: string | null;
  selectedPutIn: { id: string; name: string } | null;
  selectedTakeOut: { id: string; name: string } | null;
  selectedVessel: string | null;
  currentCondition: { code: string; gaugeHeight: number | null } | null;
}
```

The river page (`rivers/[slug]/page.tsx`) updates this context as the user interacts with the planner. ChatPanel reads from it.

### 4.2 Dynamic System Prompt

When the user is on a river page, append to the system prompt:

```
CURRENT CONTEXT:
- The user is viewing the Current River page.
- Current condition: Optimal (3.4 ft at Akers Ferry gauge)
- They have selected: Baptist Camp (put-in) → Akers Ferry (take-out)
- Vessel: canoe

LOCAL KNOWLEDGE (Current River):
The Akers gauge is the primary reference. 2.0–3.0 ft is optimal. The Current is spring-fed
and forgiving, but above 3.5 ft conditions deteriorate. At 4.0 ft the river closes. Below
1.5 ft you'll drag in riffles. Van Buren (lower river) runs higher—optimal 3.0–4.0 ft,
closes at 5.0 ft.

Tip: Spring rains can cause rapid rises. If the gauge is climbing, consider another day.
The upper Current (Montauk to Akers) needs slightly more water than lower sections.
```

This way Eddy can immediately answer questions about the current river without needing tool calls — faster responses, lower latency.

### 4.3 Local Knowledge Data

Move `RIVER_SUMMARIES` from `LocalKnowledge.tsx` into a shared data file and **expand it for all 8 rivers**:

```typescript
// src/data/river-knowledge.ts
export const RIVER_KNOWLEDGE: Record<string, RiverKnowledge> = {
  'current': {
    summary: '...',
    tip: '...',
    closureLevel: 4.0,      // ft at which river closes
    optimalRange: [2.0, 3.0],
    bestMonths: ['May', 'Jun', 'Jul', 'Aug', 'Sep'],
    springFed: true,
    highlights: ['Blue Spring', 'Welch Spring', 'Round Spring', 'Cave Spring'],
    classicFloats: [
      { putIn: 'Baptist Camp', takeOut: 'Akers Ferry', miles: 8.2, description: 'Classic half-day, bluffs and springs' },
      { putIn: 'Akers Ferry', takeOut: 'Pulltite', miles: 9.5, description: 'Scenic stretch past Round Spring' },
    ],
  },
  // ... all 8 rivers
};
```

---

## 5. Tool Redesign

### 5.1 Updated Tools

#### `get_river_conditions` (updated)
```json
{
  "name": "get_river_conditions",
  "description": "Get current water conditions for one or all rivers. Returns USGS gauge height, discharge, condition rating, and reading freshness. Use river_slug to check a specific river, or omit for all rivers.",
  "parameters": {
    "river_slug": {
      "type": "string",
      "description": "River slug. Valid values: current, meramec, eleven-point, jacks-fork, niangua, big-piney, huzzah, courtois. Omit for all rivers."
    }
  }
}
```

#### `get_access_points` (updated)
Same as current but with correct slug examples.

#### `calculate_float_plan` (updated - direct DB, no self-fetch)
```json
{
  "name": "calculate_float_plan",
  "description": "Calculate a float plan between two access points on a river. Returns distance, float time, shuttle drive time, conditions, and hazards. Use exact access point names from get_access_points results.",
  "parameters": {
    "river_slug": { "type": "string", "required": true },
    "start_access_name": { "type": "string", "required": true, "description": "Name of put-in access point" },
    "end_access_name": { "type": "string", "required": true, "description": "Name of take-out access point" },
    "vessel_type": { "type": "string", "description": "One of: kayak, canoe, tube, raft. Default: canoe." }
  }
}
```

**Implementation change:** Rewrite to call Supabase + USGS + Mapbox directly instead of fetching `/api/plan`. Extract the core planning logic from `route.ts` into a shared `lib/planning/calculatePlan.ts` that both the API route and the chat tool can call.

#### `get_river_hazards` (updated)
Same as current but with correct slug examples.

#### `get_weather` (NEW)
```json
{
  "name": "get_weather",
  "description": "Get current weather and 5-day forecast for a river area. Returns temperature, conditions, wind, humidity, and precipitation forecast.",
  "parameters": {
    "river_slug": { "type": "string", "required": true, "description": "River slug" }
  }
}
```

**Implementation:** Call `fetchWeather` and `fetchForecast` from `lib/weather/openweather.ts` directly.

#### `get_points_of_interest` (NEW)
```json
{
  "name": "get_points_of_interest",
  "description": "Get points of interest near a river: campgrounds, springs, caves, landmarks, swimming holes. Useful for trip planning and multi-day trips.",
  "parameters": {
    "river_slug": { "type": "string", "required": true },
    "category": { "type": "string", "description": "Filter by category: campground, spring, cave, landmark, swimming_hole, historic. Omit for all." }
  }
}
```

#### `compare_rivers` (NEW - from spec, never implemented)
```json
{
  "name": "compare_rivers",
  "description": "Compare current conditions across all rivers to find the best option for floating. Returns all rivers ranked by condition quality.",
  "parameters": {
    "vessel_type": { "type": "string", "description": "Filter recommendations by vessel suitability" },
    "max_difficulty": { "type": "string", "description": "Maximum difficulty rating (e.g., 'I', 'I-II')" }
  }
}
```

**Implementation:** Essentially calls `handleGetRiverConditions({})` for all rivers, then sorts by condition quality (optimal > okay > low > high > too_low > dangerous).

### 5.2 Removed / Consolidated

- `calculate_float_plan` no longer self-fetches. Shared logic extracted to `lib/planning/`.

---

## 6. Streaming Implementation

### 6.1 Server: SSE Response

Replace the current JSON response with Server-Sent Events:

```typescript
// route.ts
export async function POST(request: NextRequest) {
  // ... validation, rate limiting ...

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Start streaming Claude response
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        stream: true,
        system: systemPrompt,
        tools: TOOLS,
        messages: anthropicMessages,
      });

      for await (const event of response) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          // Stream text tokens
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: event.delta.text })}\n\n`));
        }
        if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
          // Notify client that a tool is being called
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'tool_start', tool: event.content_block.name })}\n\n`));
        }
      }

      // Handle tool use loop (non-streamed tool execution, then stream the follow-up)
      // ... tool execution logic ...

      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

### 6.2 Client: Streaming Hook

```typescript
// useChat.ts - streaming version
const response = await fetch('/api/chat', { method: 'POST', body, headers });
const reader = response.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const lines = decoder.decode(value).split('\n');
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const event = JSON.parse(line.slice(6));

    switch (event.type) {
      case 'text':
        // Append to current message incrementally
        appendToMessage(event.content);
        break;
      case 'tool_start':
        // Show "Checking conditions..." or similar
        setToolStatus(event.tool);
        break;
      case 'done':
        setIsLoading(false);
        break;
    }
  }
}
```

### 6.3 Tool Status Feedback

Instead of generic "Eddy is thinking...", show what Eddy is actually doing:

| Tool being called | Status message |
|-------------------|----------------|
| `get_river_conditions` | "Checking river conditions..." |
| `get_access_points` | "Looking up access points..." |
| `calculate_float_plan` | "Calculating your float plan..." |
| `get_river_hazards` | "Checking for hazards..." |
| `get_weather` | "Checking the weather..." |
| `get_points_of_interest` | "Finding nearby points of interest..." |
| `compare_rivers` | "Comparing all rivers..." |

---

## 7. Updated System Prompt

```
You are Eddy, the AI float trip assistant for the Eddy app — a Missouri Ozarks river trip planner.

IDENTITY:
- Named after the river feature (an eddy: a calm area behind an obstruction).
- You help plan float trips on 8 Missouri rivers: Meramec, Current, Eleven Point, Jacks Fork, Niangua, Big Piney, Huzzah Creek, and Courtois Creek.
- You speak like a knowledgeable local river guide — friendly, direct, and practical.

RIVER SLUGS (use these exact values in tool calls):
- Current River → "current"
- Meramec River → "meramec"
- Eleven Point River → "eleven-point"
- Jacks Fork River → "jacks-fork"
- Niangua River → "niangua"
- Big Piney River → "big-piney"
- Huzzah Creek → "huzzah"
- Courtois Creek → "courtois"

CORE BEHAVIOR:
- Always ground answers in real data. Cite gauge height, condition code, and reading time.
- If data is stale (>6 hours old), warn the user.
- If a river is "dangerous" or "too_low", lead with that — don't bury it.
- Never recommend floating in dangerous conditions. Be direct.
- Factor in: conditions, difficulty, vessel type, desired length.
- Keep responses concise. Answer first, then details. Bullets over paragraphs.
- Use river terminology: put-in, take-out, gauge, stage, CFS, gravel bar, riffle, shuttle.

SAFETY:
- Include brief safety note on trip plans: "Always confirm conditions with local outfitters. Water levels can change rapidly."
- For dangerous conditions, be unambiguous. Do not soften.

WEATHER CONTEXT:
- You DO have access to weather data. Use the get_weather tool when users ask about weather or when recommending trips (rain impacts conditions).
- Factor precipitation forecast into trip recommendations — heavy rain upstream means rising water.

WHAT YOU DON'T DO:
- Book shuttles or rentals. Share outfitter info if available.
- Legal advice about river access or property rights.
- Make up data. If unavailable, say so.

RESPONSE FORMAT:
Condition checks:
  **[River Name]** — [Condition Label]
  - Stage: [X.XX] ft | Flow: [X,XXX] cfs
  - Reading: [time ago]
  - [warnings]

Trip plans:
  **[Put-in]** → **[Take-out]**
  - Distance: [X.X] mi
  - Float time: [X hrs X min] ([vessel])
  - Shuttle drive: [X min]
  - Conditions: [label]

TONE:
- "The Current at Akers is running 3.4 ft — right in the sweet spot."
- "Huzzah is pretty low (1.1 ft). You'll drag in spots. Doable in a canoe if you don't mind walking."
- "Skip the Jacks Fork today. Eminence reads 11.2 ft — flood territory."
- NOT: "Based on my analysis of the current hydrological data..."
- NOT: "OMG the river is PERFECT today!!! 🎉"

{CONTEXT_INJECTION}
```

The `{CONTEXT_INJECTION}` placeholder is replaced at runtime with:

```
CURRENT CONTEXT:
- User is on the [River Name] page
- Condition: [code] ([gauge height] ft at [gauge name])
- Selected: [put-in name] → [take-out name] (if any)
- Vessel: [type] (if selected)

LOCAL KNOWLEDGE ([River Name]):
[summary from RIVER_KNOWLEDGE]
[tip from RIVER_KNOWLEDGE]
```

---

## 8. ChatPanel Redesign

### 8.1 Context Wiring

**Option A: Context Provider (recommended)**
Create a `ChatContextProvider` in the river page that passes state up to the root-level ChatPanel.

```tsx
// layout.tsx
<Providers>
  <SiteHeader />
  {children}
  <ChatPanel />  {/* reads from ChatContext */}
</Providers>
```

```tsx
// rivers/[slug]/page.tsx
<ChatContextProvider value={{ riverSlug: slug, riverName, selectedPutIn, selectedTakeOut, vessel, condition }}>
  {/* river page content */}
</ChatContextProvider>
```

**Option B: URL-based context**
ChatPanel reads the current URL (`/rivers/current`) and extracts the slug. Simpler but less data-rich.

Recommendation: **Option A** for full context, with **Option B as fallback** for non-river pages.

### 8.2 Quick Actions — Context-Aware

Instead of static quick actions, make them dynamic:

**On homepage:**
```
"Which rivers are running well?"
"Plan a float trip"
"What's the weather like?"
```

**On a river page (e.g., Current River):**
```
"How's the Current running?"
"Plan a float on the Current"
"Any hazards on the Current?"
"What's the weather near Van Buren?"
```

**When a plan is selected:**
```
"Tell me about this float"
"Any hazards on this stretch?"
"What should I bring?"
```

### 8.3 Markdown Rendering

Replace the regex `formatMarkdown` + `dangerouslySetInnerHTML` with `react-markdown`:

```tsx
import ReactMarkdown from 'react-markdown';

// In ChatMessageBubble:
<ReactMarkdown className="prose prose-sm prose-blue max-w-none">
  {message.content}
</ReactMarkdown>
```

This handles bold, italic, lists, links, headers, and code blocks safely without XSS risk.

### 8.4 Deep Links in Responses

Eddy should link to relevant pages when mentioning rivers or access points:

```
Check out the [Current River](/rivers/current) — it's running optimal right now.
```

This requires adding a post-processing step or instructing Claude to include links in the format `[text](/rivers/slug)`.

---

## 9. Token Management

### 9.1 Conversation Truncation

Instead of sending all 50 messages every time:
- Always send the **system prompt** (with context)
- Always send the **last 2 user messages + responses** in full
- For older messages, send a **summary** or just the user message (drop tool-use blocks)
- Set a token budget (e.g., 8k tokens for conversation history)

### 9.2 Max Tokens

Increase `max_tokens` from 1024 to **2048** — some responses (multi-river comparisons, detailed plans) get cut off at 1024.

---

## 10. Model Selection

Current: `claude-sonnet-4-5-20250929`

Recommendation: Keep Sonnet 4.5 for now. It's the right balance of quality, speed, and cost for this use case. Haiku would be faster but might lose the personality nuance. Opus would be overkill for a chat assistant.

Consider: Using **Haiku 4.5** for simple condition checks (detected by keyword matching on the user message), and **Sonnet 4.5** for complex planning queries. This would reduce latency for the most common query type.

---

## 11. File Structure Changes

### New files:
```
src/data/river-knowledge.ts          # Local knowledge for all 8 rivers
src/lib/planning/calculatePlan.ts    # Shared planning logic (extracted from route.ts)
src/context/ChatContext.tsx           # React context for chat state
```

### Modified files:
```
src/app/api/chat/route.ts            # Full rewrite: streaming, new tools, context injection, slug fix
src/hooks/useChat.ts                 # Streaming support, context integration
src/components/chat/ChatPanel.tsx    # Context-aware quick actions, react-markdown, tool status
src/app/layout.tsx                   # Wrap with ChatContextProvider (or read from URL)
src/app/rivers/[slug]/page.tsx       # Update ChatContext when river/plan state changes
```

### Removed:
```
(nothing removed — everything is modified in place)
```

---

## 12. Implementation Phases

### Phase 1: Critical Fixes (do first)
1. Fix slug mismatch in tool descriptions + add server-side normalization
2. Wire ChatPanel context from river pages (Option A or B)
3. Inject local knowledge into system prompt
4. Add slug map to system prompt
5. Fix `formatMarkdown` XSS risk (replace with react-markdown)

### Phase 2: New Tools
1. Add `get_weather` tool (calls existing OpenWeather integration)
2. Add `get_points_of_interest` tool (calls existing POI data)
3. Add `compare_rivers` tool
4. Extract shared planning logic from `/api/plan/route.ts` into `lib/planning/`
5. Rewrite `calculate_float_plan` to use shared logic directly

### Phase 3: Streaming & UX
1. Convert API to SSE streaming
2. Update `useChat` hook for streaming consumption
3. Add tool-status feedback ("Checking conditions...")
4. Add context-aware quick actions
5. Add deep links in responses

### Phase 4: Intelligence & Polish
1. Expand `RIVER_KNOWLEDGE` for all 8 rivers (currently only 3)
2. Add classic float recommendations per river
3. Token management / conversation truncation
4. Consider Haiku routing for simple queries
5. Add "Eddy suggests" proactive tips based on current conditions

---

## 13. Open Questions for Discussion

1. **Conversation persistence** — Currently no chat history is saved. Should we store conversations in Supabase for continuity across page reloads?

2. **Auth integration** — Should logged-in users get a higher rate limit? Should Eddy reference their saved trips?

3. **Proactive suggestions** — Should Eddy surface a notification when conditions change (e.g., "Heads up — the Current just dropped to Low")?

4. **Outfitter data** — The spec mentions sharing outfitter info. Is there a data source for shuttle services / canoe rentals?

5. **Mobile UX** — The full-screen mobile chat works but blocks the river page. Should it be a bottom sheet instead?

6. **Analytics** — Should we track query types, rivers mentioned, and tool usage to improve Eddy over time?

7. **Fallback behavior** — When the Anthropic API is down, should we show cached responses or a graceful error?

8. **River knowledge expansion** — Currently only 3 of 8 rivers have local knowledge data. Who writes the remaining 5? Is there existing content to pull from?
