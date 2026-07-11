// src/lib/embed/cards.ts
// Server-side logic for location-pinned embed cards ("Floatable From Here").
//
// The embedder pins their business location once at onboarding: we geocode,
// resolve the nearest active river + access point (nearest_rivers_to_point /
// nearest_access_points_to_point, migration 00148), fetch drive time from the
// business to the launch (Mapbox Directions), and persist everything on an
// embed_widgets row keyed by a short public embed_id. At render time only the
// live condition is computed (get_river_condition_segment scoped to the
// launch point); the geo work is never repeated per page load.

import { randomBytes } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { geocodeAddress, getDriveTime } from '@/lib/mapbox/directions';
import { mapConditionCode } from '@/lib/conditions';
import { riverPath } from '@/lib/navigation/river-path';
import type { ConditionCode } from '@/types/api';

const METERS_PER_MILE = 1609.34;

// Mirrors drive_time_cache policy: 30 days normally, 1 hour when the reach is
// high/dangerous (roads and low-water bridges can close).
const DRIVE_TTL_NORMAL_MS = 30 * 24 * 60 * 60 * 1000;
const DRIVE_TTL_ELEVATED_MS = 60 * 60 * 1000;

function ewktPoint(lng: number, lat: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

export interface NearbyRiver {
  riverId: string;
  slug: string;
  name: string;
  state: string;
  distanceMiles: number;
}

export interface NearbyAccessPoint {
  accessPointId: string;
  name: string;
  slug: string;
  type: string;
  riverId: string;
  riverSlug: string;
  riverName: string;
  riverMile: number | null;
  distanceMiles: number;
  lng: number;
  lat: number;
}

export interface ResolvedEmbedLocation {
  lat: number;
  lng: number;
  rivers: NearbyRiver[];
  accessPoints: NearbyAccessPoint[];
}

/**
 * Onboarding step 1: turn an address (or raw coords) into candidate rivers +
 * launch points the embedder confirms. Returns null when the address can't be
 * geocoded or nothing floatable is nearby.
 */
export async function resolveEmbedLocation(input: {
  address?: string;
  lat?: number;
  lng?: number;
}): Promise<ResolvedEmbedLocation | null> {
  let lat = input.lat;
  let lng = input.lng;

  if ((lat == null || lng == null) && input.address) {
    const center = await geocodeAddress(input.address);
    if (!center) return null;
    [lng, lat] = center;
  }
  if (lat == null || lng == null) return null;

  const supabase = createAdminClient();
  const point = ewktPoint(lng, lat);

  const [riversResult, accessResult] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)('nearest_rivers_to_point', { p_point: point, p_limit: 3 }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)('nearest_access_points_to_point', { p_point: point, p_limit: 5 }),
  ]);

  if (riversResult.error) {
    console.error('[EmbedCards] nearest_rivers_to_point failed:', riversResult.error);
    return null;
  }
  if (accessResult.error) {
    console.error('[EmbedCards] nearest_access_points_to_point failed:', accessResult.error);
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rivers: NearbyRiver[] = (riversResult.data || []).map((r: any) => ({
    riverId: r.river_id,
    slug: r.slug,
    name: r.name,
    state: r.state,
    distanceMiles: Math.round((Number(r.distance_meters) / METERS_PER_MILE) * 10) / 10,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accessPoints: NearbyAccessPoint[] = (accessResult.data || []).map((a: any) => ({
    accessPointId: a.access_point_id,
    name: a.name,
    slug: a.slug,
    type: a.type,
    riverId: a.river_id,
    riverSlug: a.river_slug,
    riverName: a.river_name,
    riverMile: a.river_mile != null ? Number(a.river_mile) : null,
    distanceMiles: Math.round((Number(a.distance_meters) / METERS_PER_MILE) * 10) / 10,
    lng: Number(a.lng),
    lat: Number(a.lat),
  }));

  if (rivers.length === 0 || accessPoints.length === 0) return null;

  return { lat, lng, rivers, accessPoints };
}

export interface CreateEmbedCardInput {
  lat: number;
  lng: number;
  address?: string;
  businessName?: string;
  riverId: string;
  accessPointId: string;
  logoUrl?: string;
  accentColor?: string;
  ctaUrl?: string;
  ctaLabel?: string;
}

export interface EmbedCardRecord {
  embedId: string;
  businessName: string | null;
  riverSlug: string;
  riverName: string;
  accessPointName: string | null;
  straightLineMiles: number | null;
  driveMinutes: number | null;
  driveMiles: number | null;
}

function mintEmbedId(): string {
  // 8 chars of base36 ≈ 41 bits — unguessable at this scale, short in markup.
  return `emb_${randomBytes(6).toString('hex').slice(0, 8)}`;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function safeHttpUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Onboarding step 2: persist the confirmed pin. Drive time is fetched here —
 * once, at install — and cached on the row; a Mapbox failure degrades to
 * straight-line only (never fabricated minutes).
 */
export async function createEmbedCard(input: CreateEmbedCardInput): Promise<EmbedCardRecord | null> {
  const supabase = createAdminClient();
  const point = ewktPoint(input.lng, input.lat);

  // Re-derive the chosen access point server-side (don't trust client coords).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: candidates, error: accessError } = await (supabase.rpc as any)(
    'nearest_access_points_to_point',
    { p_point: point, p_river_id: input.riverId, p_limit: 10 }
  );
  if (accessError) {
    console.error('[EmbedCards] access lookup failed:', accessError);
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chosen = (candidates || []).find((a: any) => a.access_point_id === input.accessPointId);
  if (!chosen) return null;

  const straightLineMiles =
    Math.round((Number(chosen.distance_meters) / METERS_PER_MILE) * 100) / 100;

  // Current condition for the reach — passed to getDriveTime so Mapbox's
  // cache TTL shortens during high water (roads may close).
  const condition = await fetchSegmentCondition(supabase, input.riverId, ewktPoint(chosen.lng, chosen.lat));

  let driveMinutes: number | null = null;
  let driveMiles: number | null = null;
  let driveFetchedAt: string | null = null;
  try {
    const drive = await getDriveTime(input.lng, input.lat, chosen.lng, chosen.lat, condition?.code);
    driveMinutes = drive.minutes;
    driveMiles = drive.miles;
    driveFetchedAt = new Date().toISOString();
  } catch (e) {
    console.warn('[EmbedCards] drive time unavailable at install, storing straight-line only:', e);
  }

  const embedId = mintEmbedId();
  const { data: row, error: insertError } = await supabase
    .from('embed_widgets')
    .insert({
      embed_id: embedId,
      business_name: input.businessName?.slice(0, 120) || null,
      address: input.address?.slice(0, 300) || null,
      location: point,
      river_id: input.riverId,
      access_point_id: input.accessPointId,
      straight_line_miles: straightLineMiles,
      drive_minutes: driveMinutes,
      drive_miles: driveMiles,
      drive_fetched_at: driveFetchedAt,
      logo_url: safeHttpUrl(input.logoUrl),
      accent_color: input.accentColor && HEX_COLOR.test(input.accentColor) ? input.accentColor : null,
      cta_url: safeHttpUrl(input.ctaUrl),
      cta_label: input.ctaLabel?.slice(0, 60) || null,
    })
    .select('embed_id, business_name')
    .single();

  if (insertError || !row) {
    console.error('[EmbedCards] insert failed:', insertError);
    return null;
  }

  return {
    embedId: row.embed_id,
    businessName: row.business_name,
    riverSlug: chosen.river_slug,
    riverName: chosen.river_name,
    accessPointName: chosen.name,
    straightLineMiles,
    driveMinutes,
    driveMiles,
  };
}

// ---------------------------------------------------------------------------
// Branding-only registrations (migration 00163): the same embed_widgets table
// carries rows with widget_type='branding' — no pin, no river — that let any
// widget render a partner's logo/color/backlink via ?e=<embed_id>.
// ---------------------------------------------------------------------------

export interface CreateEmbedBrandingInput {
  businessName: string;
  siteUrl?: string;
  logoUrl?: string;
  accentColor?: string;
}

export async function createEmbedBranding(
  input: CreateEmbedBrandingInput
): Promise<{ embedId: string } | null> {
  const businessName = input.businessName.trim().slice(0, 120);
  if (!businessName) return null;

  const supabase = createAdminClient();
  const embedId = mintEmbedId();
  const { data, error } = await supabase
    .from('embed_widgets')
    .insert({
      embed_id: embedId,
      widget_type: 'branding',
      business_name: businessName,
      site_url: safeHttpUrl(input.siteUrl),
      logo_url: safeHttpUrl(input.logoUrl),
      accent_color: input.accentColor && HEX_COLOR.test(input.accentColor) ? input.accentColor : null,
    })
    .select('embed_id')
    .single();

  if (error || !data) {
    console.error('[EmbedBranding] insert failed:', error);
    return null;
  }
  return { embedId: data.embed_id };
}

export interface EmbedBrandingRecord {
  businessName: string | null;
  logoUrl: string | null;
  accentColor: string | null;
  siteUrl: string | null;
}

/**
 * Public branding payload for co-branded widgets. Deliberately never selects
 * the address or location — those stay service-role-private even though the
 * embed_id itself is public in markup.
 */
export async function getEmbedBranding(embedId: string): Promise<EmbedBrandingRecord | null> {
  if (!/^emb_[0-9a-f]{8}$/.test(embedId)) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('embed_widgets')
    .select('business_name, logo_url, accent_color, site_url, cta_url, active')
    .eq('embed_id', embedId)
    .maybeSingle();

  if (error || !data || data.active === false) {
    if (error) console.error('[EmbedBranding] lookup failed:', error);
    return null;
  }
  return {
    businessName: data.business_name,
    logoUrl: data.logo_url,
    // Card rows registered before 00163 have no site_url — fall back to their
    // booking link so the co-branded credit still points at the partner.
    siteUrl: data.site_url || data.cta_url || null,
    accentColor: data.accent_color,
  };
}

interface SegmentCondition {
  code: ConditionCode;
  label: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  gaugeName: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchSegmentCondition(supabase: any, riverId: string, launchPoint: string): Promise<SegmentCondition | null> {
  const { data, error } = await supabase.rpc('get_river_condition_segment', {
    p_river_id: riverId,
    p_put_in_point: launchPoint,
  });
  if (error || !data?.[0]) {
    if (error) console.error('[EmbedCards] condition lookup failed:', error);
    return null;
  }
  const c = data[0];
  return {
    code: mapConditionCode(c.condition_code),
    label: c.condition_label,
    gaugeHeightFt: c.gauge_height_ft != null ? Number(c.gauge_height_ft) : null,
    dischargeCfs: c.discharge_cfs != null ? Number(c.discharge_cfs) : null,
    gaugeName: c.gauge_name ?? null,
  };
}

export interface EmbedCardData {
  embedId: string;
  businessName: string | null;
  riverName: string;
  riverSlug: string;
  riverPath: string;
  accessPointName: string | null;
  straightLineMiles: number | null;
  driveMinutes: number | null;
  driveMiles: number | null;
  condition: SegmentCondition | null;
  logoUrl: string | null;
  accentColor: string | null;
  ctaUrl: string | null;
  ctaLabel: string | null;
}

/**
 * Runtime payload for the card page. One row read + one condition RPC; drive
 * time is refreshed from Mapbox only when the cached value has expired
 * (30 d normally, 1 h while the reach is high/dangerous).
 */
export async function getEmbedCardData(embedId: string): Promise<EmbedCardData | null> {
  if (!/^emb_[0-9a-f]{8}$/.test(embedId)) return null;

  const supabase = createAdminClient();
  const { data: card, error } = await supabase
    .from('embed_widgets')
    .select(`
      id, embed_id, business_name, straight_line_miles,
      drive_minutes, drive_miles, drive_fetched_at,
      logo_url, accent_color, cta_url, cta_label, active,
      location,
      rivers!inner ( id, slug, name, state ),
      access_points ( id, name, location_snap )
    `)
    .eq('embed_id', embedId)
    .maybeSingle();

  if (error || !card || card.active === false) {
    if (error) console.error('[EmbedCards] card lookup failed:', error);
    return null;
  }

  const river = card.rivers as unknown as { id: string; slug: string; name: string; state: string };
  const accessPoint = card.access_points as unknown as {
    id: string;
    name: string;
    location_snap: { coordinates?: number[] } | null;
  } | null;

  const launchCoords = accessPoint?.location_snap?.coordinates ?? null;
  const launchPoint = launchCoords ? ewktPoint(launchCoords[0], launchCoords[1]) : null;

  const condition = launchPoint
    ? await fetchSegmentCondition(supabase, river.id, launchPoint)
    : null;

  // Refresh the cached drive time when expired; failure keeps the old value.
  let driveMinutes = card.drive_minutes != null ? Number(card.drive_minutes) : null;
  let driveMiles = card.drive_miles != null ? Number(card.drive_miles) : null;
  const hostCoords = (card.location as { coordinates?: number[] } | null)?.coordinates ?? null;
  if (launchCoords && hostCoords) {
    const elevated = condition?.code === 'high' || condition?.code === 'dangerous';
    const ttl = elevated ? DRIVE_TTL_ELEVATED_MS : DRIVE_TTL_NORMAL_MS;
    const fetchedAt = card.drive_fetched_at ? new Date(card.drive_fetched_at).getTime() : 0;
    if (Date.now() - fetchedAt > ttl) {
      try {
        const drive = await getDriveTime(
          hostCoords[0], hostCoords[1], launchCoords[0], launchCoords[1], condition?.code
        );
        driveMinutes = drive.minutes;
        driveMiles = drive.miles;
        await supabase
          .from('embed_widgets')
          .update({
            drive_minutes: drive.minutes,
            drive_miles: drive.miles,
            drive_fetched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', card.id);
      } catch (e) {
        console.warn('[EmbedCards] drive refresh failed, keeping cached value:', e);
      }
    }
  }

  return {
    embedId: card.embed_id,
    businessName: card.business_name,
    riverName: river.name,
    riverSlug: river.slug,
    riverPath: riverPath(river.state || 'MO', river.slug),
    accessPointName: accessPoint?.name ?? null,
    straightLineMiles: card.straight_line_miles != null ? Number(card.straight_line_miles) : null,
    driveMinutes,
    driveMiles,
    condition,
    logoUrl: card.logo_url,
    accentColor: card.accent_color,
    ctaUrl: card.cta_url,
    ctaLabel: card.cta_label,
  };
}
