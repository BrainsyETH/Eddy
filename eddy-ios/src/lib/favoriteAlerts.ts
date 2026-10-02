import type { AlertRule } from '@eddy/types';

/** River cards summarize river rules; gauge/dam cards match the actual station. */
export function favoriteAlerts(rules: AlertRule[], kind: 'river' | 'gauge' | 'dam', entityId: string, siteId?: string | null) {
  const matches = rules.filter(rule => kind === 'river'
    ? rule.riverId === entityId
    : (kind === 'gauge' && rule.gaugeId === entityId) || Boolean(siteId && rule.usgsSiteId === siteId));
  const active = matches.some(rule => rule.enabled && !(rule.oneShot && rule.firedAt)
    && (!rule.parentId || rules.some(parent => parent.source === 'river_condition' && parent.id === rule.parentId && parent.enabled)));
  return { matches, active };
}
