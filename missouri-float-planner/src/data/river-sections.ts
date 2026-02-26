// src/data/river-sections.ts
// Defines river sections for AI-generated Eddy updates.
// Only rivers with meaningfully different upper/lower conditions get sections.
// Others are treated as a single unit (section_slug = null).

export interface RiverSection {
  sectionSlug: string;     // e.g. "upper-current"
  name: string;            // e.g. "Upper Current (Montauk to Akers)"
  description: string;     // context for Eddy's prompt
}

export interface RiverSectionConfig {
  riverSlug: string;
  riverName: string;
  sections: RiverSection[];  // empty = whole river, no section breakdown
}

export const RIVER_SECTIONS: RiverSectionConfig[] = [
  {
    riverSlug: 'current',
    riverName: 'Current River',
    sections: [
      {
        sectionSlug: 'upper-current',
        name: 'Upper Current (Montauk to Akers)',
        description:
          'Headwaters section fed by Montauk Spring. Narrower, shallower, needs a touch more water. ' +
          'Popular for day trips from Montauk to Cedar Grove or Baptist Camp.',
      },
      {
        sectionSlug: 'lower-current',
        name: 'Lower Current (Akers to Two Rivers)',
        description:
          'Wider, deeper, more forgiving. Big Bluff, Pulltite, Round Spring. ' +
          'Better for multi-day trips and handles low water more gracefully.',
      },
    ],
  },
  {
    riverSlug: 'meramec',
    riverName: 'Meramec River',
    sections: [
      {
        sectionSlug: 'upper-meramec',
        name: 'Upper Meramec (above Meramec State Park)',
        description:
          'More scenic, narrower, some rapids. St. James to Meramec State Park. ' +
          'Popular for experienced paddlers seeking a challenge.',
      },
      {
        sectionSlug: 'lower-meramec',
        name: 'Lower Meramec (below Meramec State Park)',
        description:
          'Wider, calmer, better for beginners and tubers. ' +
          'Meramec State Park to Sullivan area. More accessible put-ins.',
      },
    ],
  },
  {
    riverSlug: 'eleven-point',
    riverName: 'Eleven Point River',
    sections: [],
  },
  {
    riverSlug: 'jacks-fork',
    riverName: 'Jacks Fork River',
    sections: [],
  },
  {
    riverSlug: 'niangua',
    riverName: 'Niangua River',
    sections: [],
  },
  {
    riverSlug: 'big-piney',
    riverName: 'Big Piney River',
    sections: [],
  },
  {
    riverSlug: 'huzzah',
    riverName: 'Huzzah Creek',
    sections: [],
  },
  {
    riverSlug: 'courtois',
    riverName: 'Courtois Creek',
    sections: [],
  },
];

/**
 * Returns all update targets: one entry per river section, or one entry for
 * whole-river if the river has no sections.
 */
export interface UpdateTarget {
  riverSlug: string;
  riverName: string;
  sectionSlug: string | null;
  sectionName: string | null;
  sectionDescription: string | null;
}

export function getUpdateTargets(): UpdateTarget[] {
  const targets: UpdateTarget[] = [];

  for (const river of RIVER_SECTIONS) {
    // Always generate a whole-river update (section_slug = null).
    // The frontend fetches this by default on the river page.
    targets.push({
      riverSlug: river.riverSlug,
      riverName: river.riverName,
      sectionSlug: null,
      sectionName: null,
      sectionDescription: null,
    });

    // For rivers with sections, also generate per-section updates
    for (const section of river.sections) {
      targets.push({
        riverSlug: river.riverSlug,
        riverName: river.riverName,
        sectionSlug: section.sectionSlug,
        sectionName: section.name,
        sectionDescription: section.description,
      });
    }
  }

  return targets;
}
