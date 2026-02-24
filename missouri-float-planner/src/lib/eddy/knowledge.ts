// src/lib/eddy/knowledge.ts
// Parses EDDY_KNOWLEDGE.md and extracts relevant sections for each river/section.
// Only the General section + the matching river/section content is injected into
// each Haiku prompt, keeping token usage efficient even as the file grows.

import { readFileSync } from 'fs';
import { join } from 'path';

interface KnowledgeSections {
  general: string;
  rivers: Record<string, {
    main: string;
    subsections: Record<string, string>;
  }>;
}

let cachedKnowledge: KnowledgeSections | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // Re-read file every 5 minutes

/**
 * Parses the EDDY_KNOWLEDGE.md file into structured sections.
 * Caches the result for 5 minutes to avoid repeated file reads during a cron run.
 */
function parseKnowledgeFile(): KnowledgeSections {
  const now = Date.now();
  if (cachedKnowledge && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedKnowledge;
  }

  const filePath = join(process.cwd(), 'EDDY_KNOWLEDGE.md');
  let content: string;

  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    console.warn('[EddyKnowledge] EDDY_KNOWLEDGE.md not found, using empty knowledge');
    cachedKnowledge = { general: '', rivers: {} };
    cacheTimestamp = now;
    return cachedKnowledge;
  }

  const sections: KnowledgeSections = { general: '', rivers: {} };
  const lines = content.split('\n');

  let currentH2 = ''; // Current ## heading (normalized to slug)
  let currentH3 = ''; // Current ### heading (normalized to slug)
  let buffer: string[] = [];

  function flushBuffer() {
    const text = buffer.join('\n').trim();
    if (!text) return;

    if (currentH2 === 'general') {
      sections.general = text;
    } else if (currentH2) {
      if (!sections.rivers[currentH2]) {
        sections.rivers[currentH2] = { main: '', subsections: {} };
      }
      if (currentH3) {
        sections.rivers[currentH2].subsections[currentH3] = text;
      } else {
        sections.rivers[currentH2].main = text;
      }
    }
    buffer = [];
  }

  for (const line of lines) {
    // Match ## headings (river names or "General")
    const h2Match = line.match(/^## (.+)/);
    if (h2Match) {
      flushBuffer();
      currentH2 = slugify(h2Match[1]);
      currentH3 = '';
      continue;
    }

    // Match ### headings (subsections like "Upper Current")
    const h3Match = line.match(/^### (.+)/);
    if (h3Match) {
      flushBuffer();
      currentH3 = slugify(h3Match[1]);
      continue;
    }

    // Skip the top-level # heading and format rules
    if (line.startsWith('# ')) continue;
    if (line === '---') continue;

    buffer.push(line);
  }

  flushBuffer();
  cachedKnowledge = sections;
  cacheTimestamp = now;
  return sections;
}

/**
 * Returns the knowledge text relevant to a specific river and optional section.
 * Always includes the General section + the river's main section.
 * If a sectionSlug is provided, also includes that subsection.
 */
export function getKnowledgeForTarget(
  riverSlug: string,
  sectionSlug: string | null
): string {
  const knowledge = parseKnowledgeFile();
  const parts: string[] = [];

  // Always include general knowledge
  if (knowledge.general) {
    parts.push('=== General Ozarks Knowledge ===');
    parts.push(knowledge.general);
  }

  // Include river-specific knowledge
  const river = knowledge.rivers[riverSlug];
  if (river) {
    parts.push(`\n=== ${riverSlug} River Knowledge ===`);
    if (river.main) {
      parts.push(river.main);
    }

    // Include matching subsection if provided
    if (sectionSlug) {
      const subsection = river.subsections[sectionSlug];
      if (subsection) {
        parts.push(`\n=== Section: ${sectionSlug} ===`);
        parts.push(subsection);
      }
    }
  }

  return parts.join('\n');
}

/**
 * Converts a heading to a slug for matching.
 * "Upper Current" -> "upper-current"
 * "Current River" -> "current"
 * "Jacks Fork River" -> "jacks-fork"
 */
function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/\s+river$/i, '')    // Remove trailing "River"
    .replace(/\s+creek$/i, '')    // Remove trailing "Creek"
    .replace(/\(.+\)/, '')        // Remove parentheticals
    .trim()
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '');      // Trim leading/trailing hyphens
}
