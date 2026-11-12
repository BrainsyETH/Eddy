/** Only existing native screens may be promoted. Never accept a return URL. */
export type AppDestination =
  | { kind: 'plan'; id: string }
  | { kind: 'river'; id: string }
  | { kind: 'gauge'; id: string }
  | { kind: 'access'; id: string; river: string };

export type AppDestinationQuery = { plan?: unknown; river?: unknown; gauge?: unknown; access?: unknown };
const segment = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value);

export function appDestination(params: AppDestinationQuery): AppDestination | null {
  const keys = ['plan', 'river', 'gauge', 'access'] as const;
  const present = keys.filter(key => params[key] !== undefined);
  if (present.length === 2 && present.includes('river') && present.includes('access')) {
    return segment(params.river) && segment(params.access) ? { kind: 'access', id: params.access, river: params.river } : null;
  }
  if (present.length !== 1) return null;
  const kind = present[0];
  const id = params[kind];
  if (kind === 'access' || !segment(id) || (kind === 'plan' && id.length > 64)) return null;
  return { kind, id };
}

export function destinationParams(destination?: AppDestination | null): URLSearchParams {
  if (!destination) return new URLSearchParams();
  const query = destination.kind === 'access'
    ? { river: destination.river, access: destination.id }
    : { [destination.kind]: destination.id };
  return appDestination(query) ? new URLSearchParams(query) : new URLSearchParams();
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
