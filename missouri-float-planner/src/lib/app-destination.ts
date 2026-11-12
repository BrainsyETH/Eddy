/** Only existing native screens may be promoted. Never accept a return URL. */
export type AppDestination =
  | { kind: 'plan'; id: string }
  | { kind: 'river'; id: string; feature?: 'read' }
  | { kind: 'gauge'; id: string; feature?: 'read' }
  | { kind: 'access'; id: string; river: string };

export type AppDestinationQuery = { plan?: unknown; river?: unknown; gauge?: unknown; access?: unknown; feature?: unknown };
const segment = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value);

export function appDestination(params: AppDestinationQuery): AppDestination | null {
  const keys = ['plan', 'river', 'gauge', 'access'] as const;
  const present = keys.filter(key => params[key] !== undefined);
  // A landing-page topic, not a new native route or an entitlement claim.
  const read = params.feature === 'read';
  if (params.feature !== undefined && (!read || present.length !== 1 || (present[0] !== 'river' && present[0] !== 'gauge'))) return null;
  if (present.length === 2 && present.includes('river') && present.includes('access')) {
    return segment(params.river) && segment(params.access) ? { kind: 'access', id: params.access, river: params.river } : null;
  }
  if (present.length !== 1) return null;
  const kind = present[0];
  const id = params[kind];
  if (kind === 'access' || !segment(id) || (kind === 'plan' && id.length > 64)) return null;
  return read && (kind === 'river' || kind === 'gauge') ? { kind, id, feature: 'read' } : { kind, id };
}

export function destinationParams(destination?: AppDestination | null): URLSearchParams {
  if (!destination) return new URLSearchParams();
  const query = destination.kind === 'access'
    ? { river: destination.river, access: destination.id }
    : { [destination.kind]: destination.id };
  const params = new URLSearchParams(query);
  if ((destination.kind === 'river' || destination.kind === 'gauge') && destination.feature) params.set('feature', destination.feature);
  return appDestination(Object.fromEntries(params)) ? params : new URLSearchParams();
}

export function nativeDestination(destination: AppDestination): string {
  const id = encodeURIComponent(destination.id);
  return destination.kind === 'access'
    ? `/river/${encodeURIComponent(destination.river)}/access/${id}`
    : `/${destination.kind === 'plan' ? 'float' : destination.kind}/${id}`;
}

export function destinationCampaign(destination?: AppDestination | null): string | null {
  return destination ? `website_${destination.kind}` : null;
}
