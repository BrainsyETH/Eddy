// The first dam-to-app placements. Keep the CTA, landing page, and analytics
// on the same allowlist; no arbitrary return URL or native route is accepted.
const DAM_APP_PROMOTIONS = {
  'swl-bull-shoals-dam': { campaign: 'dam_bull_shoals' },
  'swl-table-rock-dam': { campaign: 'dam_table_rock' },
  'swl-beaver-dam': { campaign: 'dam_beaver' },
} as const;

export function getDamAppPromotion(value: unknown) {
  if (typeof value !== 'string' || !Object.hasOwn(DAM_APP_PROMOTIONS, value)) return null;
  const id = value as keyof typeof DAM_APP_PROMOTIONS;
  return { id, ...DAM_APP_PROMOTIONS[id], nativePath: `/dam/${id}` };
}

export function damWidgetHeadline(name: string) {
  return `${name.replace(/ Dam$/, '')} on your Home Screen.`;
}
