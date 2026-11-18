// src/lib/eddy/knowledge.ts
// Parses EDDY_KNOWLEDGE.md and hands each consumer the part of it that is
// about the water that consumer is describing.
//
// WHY SELECTION, NOT JUST LOADING. A river's Read is written from one gauge,
// and a gauge speaks for one stretch of water. A fact handed to the Read
// without saying which water it is about gets used as if it were about this
// gauge: on 2026-11-17 the Current's Read put Big Spring upstream of Van
// Buren, the Niangua's credited Bennett Spring to a gauge that sits above it,
// and the Jacks Fork's did the same with Alley Spring. Each of those facts was
// true and in the river's block. None said where it was.
//
// So the file can say where. Under a river:
//
//   ### Gauge: Van Buren {@07067000}      what this gauge sits on and speaks for
//   ### Upper Current {#upper-current} {@07064533}   a reach note, with its gauge
//   ### Towns                             services, for chat only
//
// and three consumers get three different selections:
//
//   river Read   the river-wide block, the reporting gauge's block, reach notes
//                tagged with that gauge, and one line per other gauge under an
//                "elsewhere, patterns only" header            getKnowledgeForTarget
//   gauge Read   the river-wide block, that gauge's block and its reach notes
//                                                         getRiverKnowledgeForGauge
//   chat         everything about the river, towns included   getKnowledgeForChat
//
// A river that has no confirmed block for a gauge is selected the way it was
// before gauge blocks existed. `{unconfirmed}` on a gauge heading keeps a
// drafted block out of every prompt until the owner has checked its geography.

import { readFileSync } from 'fs';
import { join } from 'path';

export interface KnowledgeGauge {
  /** The `{@site}` tag: a USGS site number, or a provider id like `swl-norfork-dam`. */
  siteId: string;
  /** "Van Buren" from "### Gauge: Van Buren". */
  name: string;
  text: string;
  /** False while the heading carries `{unconfirmed}`. */
  confirmed: boolean;
}

interface RiverKnowledge {
  /** True along the whole river. */
  main: string;
  /** Reach notes by section slug. */
  subsections: Record<string, string>;
  /** Reach note slug to the gauges it is tagged with. */
  sectionGauges: Record<string, string[]>;
  gauges: KnowledgeGauge[];
  towns: string;
}

interface KnowledgeSections {
  general: string;
  rivers: Record<string, RiverKnowledge>;
}

let cachedKnowledge: KnowledgeSections | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // Re-read file every 5 minutes

const emptyRiver = (): RiverKnowledge => ({ main: '', subsections: {}, sectionGauges: {}, gauges: [], towns: '' });

interface Heading {
  title: string;
  slug: string;
  gauges: string[];
  unconfirmed: boolean;
}

/** A heading's text with its `{@site}` and `{unconfirmed}` tags read off. */
function parseHeading(raw: string): Heading {
  const gauges = [...raw.matchAll(/\{@([A-Za-z0-9-]+)\}/g)].map((match) => match[1]);
  const unconfirmed = /\{unconfirmed\}/i.test(raw);
  const rest = raw.replace(/\{@[A-Za-z0-9-]+\}/g, '').replace(/\{unconfirmed\}/gi, '').trim();
  return { title: rest.replace(/\{#[a-z0-9-]+\}\s*$/, '').trim(), slug: slugify(rest), gauges, unconfirmed };
}

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

  cachedKnowledge = parseKnowledge(content);
  cacheTimestamp = now;
  return cachedKnowledge;
}

/** Pure, so the format can be tested on text that is not the real file. */
export function parseKnowledge(content: string): KnowledgeSections {
  const sections: KnowledgeSections = { general: '', rivers: {} };
  const lines = content.split('\n');

  let currentH2 = ''; // Current ## heading (normalized to slug)
  let currentH3: Heading | null = null;
  let buffer: string[] = [];
  // "## General" opens the knowledge proper. Everything above it is front
  // matter written for humans — "## Format Rules" is an H2 like any other, and
  // without this it parsed into a river named `format-rules`, which then looks
  // to every consumer like a knowledge section for a river that does not exist.
  let seenGeneral = false;

  function flushBuffer() {
    const text = buffer.join('\n').trim();
    buffer = [];
    if (!text || !seenGeneral) return;

    if (currentH2 === 'general') {
      // General may have subsections. Accumulate every flush instead of
      // overwriting, or the last subsection clobbers the main General primer
      // (hydrology, season, safety). Prefix the subsection heading so
      // accumulated blocks stay self-describing.
      const block = currentH3 ? `### ${currentH3.slug.replace(/-/g, ' ')}\n${text}` : text;
      sections.general = sections.general ? `${sections.general}\n\n${block}` : block;
      return;
    }
    if (!currentH2) return;

    const river = (sections.rivers[currentH2] ??= emptyRiver());
    if (!currentH3) {
      river.main = text;
    } else if (/^gauge:/i.test(currentH3.title)) {
      river.gauges.push({
        siteId: currentH3.gauges[0] ?? '',
        name: currentH3.title.replace(/^gauge:\s*/i, ''),
        text,
        confirmed: !currentH3.unconfirmed,
      });
    } else if (/^towns$/i.test(currentH3.title)) {
      river.towns = text;
    } else {
      river.subsections[currentH3.slug] = text;
      if (currentH3.gauges.length) river.sectionGauges[currentH3.slug] = currentH3.gauges;
    }
  }

  for (const line of lines) {
    // Match ## headings (river names or "General")
    const h2Match = line.match(/^## (.+)/);
    if (h2Match) {
      flushBuffer();
      currentH2 = slugify(h2Match[1]);
      currentH3 = null;
      if (currentH2 === 'general') seenGeneral = true;
      continue;
    }

    // Match ### headings (gauge blocks, reach notes, towns)
    const h3Match = line.match(/^### (.+)/);
    if (h3Match) {
      flushBuffer();
      currentH3 = parseHeading(h3Match[1]);
      continue;
    }

    // Skip the top-level # heading and format rules
    if (line.startsWith('# ')) continue;
    if (line === '---') continue;

    buffer.push(line);
  }

  flushBuffer();
  return sections;
}

const confirmedGauge = (river: RiverKnowledge | undefined, siteId: string | null | undefined) =>
  siteId ? river?.gauges.find((gauge) => gauge.confirmed && gauge.siteId === siteId) : undefined;

/** The reach notes tagged with a gauge, in file order. */
function reachNotesFor(river: RiverKnowledge, siteId: string): Array<[string, string]> {
  return Object.entries(river.subsections).filter(([slug]) => river.sectionGauges[slug]?.includes(siteId));
}

/** The body of a "- **Sits**: ..." or "- **Speaks for**: ..." line, or null. */
function labelledLine(text: string, label: 'Sits' | 'Speaks for'): string | null {
  const match = text.match(new RegExp(String.raw`^-\s*\*\*${label}\*\*:\s*(.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

/**
 * One line per OTHER gauge on the river: where it sits and what it speaks
 * for. This is all a river Read is told about water its gauge does not cover,
 * and it is told under a header that says so. The rest of each block stays
 * with that gauge's own Read.
 */
function elsewhereLines(river: RiverKnowledge, reportingSiteId: string): string[] {
  return river.gauges
    .filter((gauge) => gauge.confirmed && gauge.siteId !== reportingSiteId)
    .map((gauge) => {
      const sits = labelledLine(gauge.text, 'Sits');
      const speaksFor = labelledLine(gauge.text, 'Speaks for');
      if (!sits && !speaksFor) return null;
      return `- ${gauge.name} gauge: ${[sits, speaksFor && `Speaks for: ${speaksFor}`].filter(Boolean).join(' ')}`;
    })
    .filter((line): line is string => line != null);
}

/**
 * The knowledge for a river's Read, and for a stretch's when stretch Reads
 * are on.
 *
 * Always the General block and the river's main block. When `reportingSiteId`
 * names a gauge with a confirmed block, that block follows under "This gauge",
 * then the reach notes tagged with it, then one line per other gauge under an
 * "Elsewhere" header. Without a confirmed block the result is what it was
 * before gauge blocks existed. A `sectionSlug` adds that reach note.
 */
export function getKnowledgeForTarget(
  riverSlug: string,
  sectionSlug: string | null,
  reportingSiteId: string | null = null,
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

    const added = new Set<string>();
    const gauge = confirmedGauge(river, reportingSiteId);
    if (gauge) {
      parts.push(`\n=== This gauge: ${gauge.name} (${gauge.siteId}) ===`);
      parts.push(gauge.text);
      for (const [slug, text] of reachNotesFor(river, gauge.siteId)) {
        parts.push(`\n=== Section: ${slug} ===`);
        parts.push(text);
        added.add(slug);
      }
      const elsewhere = elsewhereLines(river, gauge.siteId);
      if (elsewhere.length) {
        parts.push('\n=== Elsewhere on this river: patterns only, never today\'s conditions ===');
        parts.push(elsewhere.join('\n'));
      }
    }

    // Include matching subsection if provided
    if (sectionSlug && !added.has(sectionSlug)) {
      const subsection = river.subsections[sectionSlug];
      if (subsection) {
        parts.push(`\n=== Section: ${sectionSlug} ===`);
        parts.push(subsection);
      }
    }
  } else {
    // Surfaces the onboarding gap that shipped Gasconade knowledge-less: an
    // active river with no "## <River>" section runs on General knowledge only.
    console.warn(
      `[EddyKnowledge] No "## " section for river "${riverSlug}" in EDDY_KNOWLEDGE.md — ` +
      'Eddy will run on General knowledge only. Add a section before launch.'
    );
  }

  return parts.join('\n');
}

/**
 * River knowledge for a secondary gauge. No General primer.
 *
 * With a confirmed block for `siteId`: the river's main block, that gauge's
 * block, and the reach notes tagged with it. Nothing about any other gauge.
 *
 * Without one, the older rule: the main block plus any reach note that names
 * the gauge's town. That guess misses a gauge whose town no note mentions and
 * catches a note that mentions the town in passing, which is what the tags
 * replace. Empty when the river has no section.
 */
export function getRiverKnowledgeForGauge(
  riverSlug: string,
  gaugeName: string | null,
  siteId: string | null = null,
): string {
  const river = parseKnowledgeFile().rivers[riverSlug];
  if (!river) return '';
  const parts = river.main ? [river.main] : [];

  const gauge = confirmedGauge(river, siteId);
  if (gauge) {
    parts.push(`This gauge: ${gauge.name} (${gauge.siteId})\n${gauge.text}`);
    for (const [slug, text] of reachNotesFor(river, gauge.siteId)) parts.push(`Section ${slug}:\n${text}`);
    return parts.join('\n\n');
  }

  const town = gaugeTown(gaugeName);
  if (town) {
    const pattern = new RegExp(`\\b${town.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    for (const [slug, text] of Object.entries(river.subsections)) {
      if (pattern.test(text)) parts.push(`Section ${slug}:\n${text}`);
    }
  }
  return parts.join('\n\n');
}

/**
 * Everything the file knows about a river, for chat: a person may ask about
 * any stretch, so nothing is held back by gauge. General alone when no river
 * is in view. Unconfirmed gauge blocks stay out here too.
 */
export function getKnowledgeForChat(riverSlug: string | null): string {
  const knowledge = parseKnowledgeFile();
  const parts: string[] = [];
  if (knowledge.general) {
    parts.push('=== General Ozarks Knowledge ===');
    parts.push(knowledge.general);
  }
  const river = riverSlug ? knowledge.rivers[riverSlug] : undefined;
  if (!river) return parts.join('\n');

  parts.push(`\n=== ${riverSlug} River Knowledge ===`);
  if (river.main) parts.push(river.main);
  for (const gauge of river.gauges) {
    if (!gauge.confirmed) continue;
    parts.push(`\n=== Gauge: ${gauge.name} (${gauge.siteId}) ===`);
    parts.push(gauge.text);
  }
  for (const [slug, text] of Object.entries(river.subsections)) {
    parts.push(`\n=== Section: ${slug} ===`);
    parts.push(text);
  }
  if (river.towns) {
    parts.push('\n=== Towns and services ===');
    parts.push(river.towns);
  }
  return parts.join('\n');
}

/** "Eureka" from "Meramec River near Eureka, MO": the last place phrase, without its state. */
export function gaugeTown(gaugeName: string | null): string | null {
  const place = gaugeName?.match(/.*\b(?:near|at|above|below)\s+(.+)$/i)?.[1];
  return place?.replace(/,\s*[A-Z]{2}\.?$/, '').trim() || null;
}

/**
 * River slugs that have a `## <River>` section in EDDY_KNOWLEDGE.md. Used by the
 * onboarding-gate check to verify every active river has knowledge.
 */
export function listKnowledgeRiverSlugs(): string[] {
  return Object.keys(parseKnowledgeFile().rivers);
}

/**
 * Subsection slugs (`### ... {#slug}`) under a river's section, in file order.
 * Empty when the river has no section. Used to compare the file's reach
 * coverage with river_sections.
 */
export function listKnowledgeSectionSlugs(riverSlug: string): string[] {
  return Object.keys(parseKnowledgeFile().rivers[riverSlug]?.subsections ?? {});
}

/** A river's `### Gauge:` blocks, drafted ones included, in file order. */
export function listKnowledgeGauges(riverSlug: string): KnowledgeGauge[] {
  return parseKnowledgeFile().rivers[riverSlug]?.gauges ?? [];
}

/** Every `{@site}` tag on a river's reach notes, by section slug. */
export function listKnowledgeSectionGauges(riverSlug: string): Record<string, string[]> {
  return parseKnowledgeFile().rivers[riverSlug]?.sectionGauges ?? {};
}

/** A river's `### Towns` block, or ''. */
export function getKnowledgeTowns(riverSlug: string): string {
  return parseKnowledgeFile().rivers[riverSlug]?.towns ?? '';
}

/** The parsed General knowledge block (for regression-testing the parser). */
export function getGeneralKnowledge(): string {
  return parseKnowledgeFile().general;
}

/**
 * Converts a heading to a slug for matching.
 *
 * An explicit `{#slug}` anchor wins outright and is the preferred form:
 *   "Big River {#big-river}" -> "big-river"
 *   "Sycamore to Warren Bridge {#hodgson-mill-to-warren-bridge}"
 *       -> "hodgson-mill-to-warren-bridge"
 *
 * Without one the slug is derived, which strips a trailing "River"/"Creek":
 *   "Upper Current" -> "upper-current"
 *   "Current River" -> "current"
 *   "Jacks Fork River" -> "jacks-fork"
 *
 * That derivation is wrong for every river whose DB slug KEEPS the suffix
 * ("big-river", "bryant-creek", "kings-river", "war-eagle-creek", ...), and it
 * is wrong silently: getKnowledgeForTarget() finds no section and Eddy writes
 * the river up from the General Ozarks primer alone, which reads as confident
 * prose rather than an error. That is the Gasconade failure this module's own
 * warning records. Anchor the heading rather than trusting the derivation.
 */
function slugify(heading: string): string {
  const anchored = heading.match(/\{#([a-z0-9-]+)\}\s*$/);
  if (anchored) return anchored[1];

  return heading
    .toLowerCase()
    .replace(/\s+river$/i, '')    // Remove trailing "River"
    .replace(/\s+creek$/i, '')    // Remove trailing "Creek"
    .replace(/\(.+\)/, '')        // Remove parentheticals
    .trim()
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '');      // Trim leading/trailing hyphens
}
