// src/lib/social/caption-generator.ts
// AI-powered caption generation using Anthropic Claude.
// Ported from ClawsifiedInfo generate-caption.sh
//
// Generates Instagram captions with hook <125 chars, "knowledgeable local" tone,
// source attribution for YouTube clips, and recent caption deduplication.

import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import type { HookStyle, ContentCategory } from './types';

const LOG_PREFIX = '[CaptionGen]';

interface CaptionParams {
  contentType: ContentCategory;
  hookStyle: HookStyle;
  riverName: string;
  conditionCode?: string;
  gaugeHeight?: number;
  clipMetadata?: {
    sourceCreator?: string;
    sourceUrl?: string;
    description?: string;
  };
}

interface GeneratedCaption {
  caption: string;
  hook: string;
  hashtags: string[];
}

// Hook style examples (from generate-caption.sh)
const HOOK_EXAMPLES: Record<HookStyle, string[]> = {
  question: [
    'Think you know the Current River?',
    'Ever floated the Meramec at this level?',
    'What makes Huzzah Creek different this week?',
  ],
  stat: [
    'The Jacks Fork just hit 3.2 ft.',
    'Water temps dropped 8° overnight on the Eleven Point.',
    '4 rivers running optimal right now.',
  ],
  urgency: [
    "The Meramec won't stay like this.",
    'Last weekend before the season ends.',
    "If you've been waiting — this is it.",
  ],
  story: [
    "I've floated this section 50 times. Today was different.",
    'The locals call this the sweet spot.',
    "Here's what the Current River looks like at 2.8 ft.",
  ],
};

/**
 * Generate a caption using Claude Sonnet.
 * Falls back to template-based generation if API fails.
 */
export async function generateCaption(params: CaptionParams): Promise<GeneratedCaption> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn(`${LOG_PREFIX} ANTHROPIC_API_KEY not set, using template fallback`);
    return generateTemplateFallback(params);
  }

  // Get recent captions for dedup
  const recentCaptions = await getRecentCaptions(5);

  const hookExamples = HOOK_EXAMPLES[params.hookStyle].join('\n- ');

  const prompt = `Generate an Instagram caption for the Eddy.guide account (Missouri float trip / river conditions guide).

REQUIREMENTS:
- Hook (first line): Under 125 characters. This is what shows before "...more"
- Tone: Sound like a knowledgeable local who paddles every weekend — NOT a tourism board
- DO NOT use marketing buzzwords like "unlock", "discover", "hidden gem", "adventure awaits"
- Be specific about the river, conditions, and what's actually happening
- 2-3 relevant keywords woven naturally
- Minimal emojis (0-2 max)
- End with a call to action pointing to eddy.guide

CONTENT TYPE: ${params.contentType}
HOOK STYLE: ${params.hookStyle}
Examples of this hook style:
- ${hookExamples}

RIVER: ${params.riverName}
${params.conditionCode ? `CONDITION: ${params.conditionCode}` : ''}
${params.gaugeHeight ? `GAUGE HEIGHT: ${params.gaugeHeight} ft` : ''}
${params.clipMetadata?.description ? `CLIP SHOWS: ${params.clipMetadata.description}` : ''}

${params.clipMetadata?.sourceCreator ? `ATTRIBUTION: Must credit "${params.clipMetadata.sourceCreator}" as the clip source. Add "📹 ${params.clipMetadata.sourceCreator}" at the end.` : ''}

RECENT CAPTIONS (avoid repeating these hooks):
${recentCaptions.map((c) => `- ${c.slice(0, 100)}`).join('\n')}

FORMAT YOUR RESPONSE AS:
HOOK: [the hook line, under 125 chars]
CAPTION: [full caption including the hook as the first line]
HASHTAGS: [5-8 hashtags, comma-separated]`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse response
    const hookMatch = text.match(/HOOK:\s*(.+)/);
    const captionMatch = text.match(/CAPTION:\s*([\s\S]*?)(?=HASHTAGS:|$)/);
    const hashtagsMatch = text.match(/HASHTAGS:\s*(.+)/);

    const hook = hookMatch?.[1]?.trim() || '';
    const caption = captionMatch?.[1]?.trim() || text.trim();
    const hashtags = hashtagsMatch?.[1]
      ?.split(',')
      .map((h) => h.trim())
      .filter((h: string) => h.startsWith('#') || h.length > 0)
      .map((h: string) => (h.startsWith('#') ? h : `#${h}`)) || [];

    if (hook.length > 125) {
      console.warn(`${LOG_PREFIX} Hook exceeds 125 chars (${hook.length}), truncating`);
    }

    console.log(`${LOG_PREFIX} Generated caption: hook="${hook.slice(0, 60)}..." (${hook.length} chars)`);

    return { caption, hook, hashtags };
  } catch (error) {
    console.error(`${LOG_PREFIX} Claude API error:`, error);
    return generateTemplateFallback(params);
  }
}

/**
 * Template-based fallback when API is unavailable.
 */
function generateTemplateFallback(params: CaptionParams): GeneratedCaption {
  const { hookStyle, riverName, conditionCode, clipMetadata } = params;

  const hooks: Record<HookStyle, (river: string) => string> = {
    question: (r) => `Ever floated the ${r} at this level?`,
    stat: (r) => `The ${r} is running ${conditionCode || 'nicely'} right now.`,
    urgency: (r) => `The ${r} won't stay like this for long.`,
    story: (r) => `Here's what the ${r} looks like right now.`,
  };

  const hook = hooks[hookStyle](riverName);

  let caption = `${hook}\n\n`;
  if (conditionCode) {
    caption += `Conditions: ${conditionCode}. `;
  }
  caption += `Check current conditions and plan your float at eddy.guide`;

  if (clipMetadata?.sourceCreator) {
    caption += `\n\n📹 ${clipMetadata.sourceCreator}`;
  }

  const hashtags = [
    '#MissouriFloat',
    '#FloatTrip',
    `#${riverName.replace(/\s+/g, '')}`,
    '#RiverLife',
    '#Kayaking',
  ];

  return { caption, hook, hashtags };
}

/**
 * Fetch recent captions for deduplication.
 */
async function getRecentCaptions(count: number): Promise<string[]> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('social_posts')
      .select('caption')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(count);

    return (data || []).map((p: { caption: string }) => p.caption).filter(Boolean);
  } catch {
    return [];
  }
}
