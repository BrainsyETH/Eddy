/** Short labels shared by the web and native section selectors. */
const BLACK_LABELS: Record<string, { title: string; subtitle: string }> = {
  'upper-lesterville': { title: 'Upper Black', subtitle: 'Lesterville–Hwy K' },
  'lower-markham-hammer': { title: 'Lower Black', subtitle: 'Markham Springs–Hammer' },
};

export function riverSectionLabel(section: { sectionSlug: string; name: string }) {
  if (BLACK_LABELS[section.sectionSlug]) return BLACK_LABELS[section.sectionSlug];
  const match = section.name.match(/^(.+?)\s*\((.+)\)$/);
  return { title: match?.[1] ?? section.name, subtitle: match?.[2] ?? '' };
}
