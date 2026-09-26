// The chat endpoint stays disabled. Its river tools share MCP schemas and services.
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createAgentExecutor } from '@/lib/agent-tools/executor';
import { toNum } from '@/lib/utils/num';
import { overlayLiveConditions } from '@/lib/social/live-conditions';

// Slug map: user-facing names → DB slugs
const SLUG_MAP: Record<string, string> = {
  'huzzah': 'huzzah',
  'huzzah_creek': 'huzzah',
  'courtois': 'courtois',
  'courtois_creek': 'courtois',
  'current': 'current',
  'current_river': 'current',
  'jacks-fork': 'jacks-fork',
  'jacks_fork': 'jacks-fork',
  'eleven-point': 'eleven-point',
  'eleven_point': 'eleven-point',
  'meramec': 'meramec',
  'meramec_river': 'meramec',
  'big-piney': 'big-piney',
  'big_piney': 'big-piney',
  'gasconade': 'gasconade',
  'niangua': 'niangua',
  'niangua_river': 'niangua',
};

function normalizeSlug(input: string): string {
  const lower = input.toLowerCase().trim().replace(/\s+/g, '-');
  return SLUG_MAP[lower] || SLUG_MAP[lower.replace(/-/g, '_')] || lower;
}

export async function executeToolCall(toolName: string, toolInput: Record<string, unknown>): Promise<unknown> {
  // These two existing chat-only capabilities never enter the public MCP.
  if (toolName === 'get_eddy_report') return handleGetEddyReport(toolInput);
  if (toolName === 'web_search') return handleWebSearch(toolInput);
  return createAgentExecutor(await createClient())(toolName, toolInput);
}

// ─── Tool 7: get_eddy_report ────────────────────────────────────────────────

async function handleGetEddyReport(input: Record<string, unknown>) {
  const riverSlug = normalizeSlug(input.river_slug as string);
  const supabase = createAdminClient();

  // Fetch most recent non-expired update for this river (whole-river)
  const { data: rawUpdate } = await supabase
    .from('eddy_updates')
    .select('river_slug, condition_code, gauge_height_ft, discharge_cfs, quote_text, summary_text, sources_used, generated_at, expires_at')
    .eq('river_slug', riverSlug)
    .is('section_slug', null)
    .gte('expires_at', new Date().toISOString())
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!rawUpdate) {
    return { error: `No current Eddy report available for ${riverSlug}. The report may have expired or not been generated yet.` };
  }

  // Overlay live gauge data so the chat answer matches what users see on the
  // river page and in social posts. If conditions have shifted buckets the
  // AI prose is suppressed — the chat assistant should not quote stale
  // narrative back to the user.
  const [update] = await overlayLiveConditions(supabase, [rawUpdate]);

  const ageMs = Date.now() - new Date(update.generated_at).getTime();
  const ageHours = Math.round(ageMs / (1000 * 60 * 60) * 10) / 10;

  return {
    riverSlug: update.river_slug,
    conditionCode: update.condition_code,
    gaugeHeightFt: toNum(update.gauge_height_ft),
    dischargeCfs: toNum(update.discharge_cfs),
    summary: update.summary_text,
    fullReport: update.quote_text,
    sourcesUsed: update.sources_used,
    generatedAt: update.generated_at,
    ageHours,
    riverUrl: `/rivers/${riverSlug}`,
  };
}

// ─── Tool 8: web_search ──────────────────────────────────────────────────────

async function handleWebSearch(input: Record<string, unknown>) {
  const query = input.query as string;
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;

  if (!apiKey) {
    return { error: 'Web search not configured. BRAVE_SEARCH_API_KEY is missing.' };
  }

  try {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', '5');
    url.searchParams.set('text_decorations', 'false');
    url.searchParams.set('search_lang', 'en');

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    });

    if (!response.ok) {
      console.error(`[ChatTool] Brave Search failed: ${response.status}`);
      return { error: `Search failed (HTTP ${response.status})` };
    }

    const data = await response.json();
    const results = data.web?.results || [];

    return {
      query,
      results: results.slice(0, 5).map((r: { title?: string; url?: string; description?: string }) => ({
        title: r.title || '',
        url: r.url || '',
        description: r.description || '',
      })),
    };
  } catch (e) {
    console.error('[ChatTool] Web search error:', e);
    return { error: `Search failed: ${e instanceof Error ? e.message : 'unknown error'}` };
  }
}
