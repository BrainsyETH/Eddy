// Turns the context a feedback form attaches (what the person was looking at)
// into links and readable facts for the admin Inbox. Context is client-sent, so
// every value is type-checked and unknown keys are kept aside, never dropped.
import { conditionDef } from '@shared/condition-system';
import { riverAccessPath, riverPath } from '@/lib/navigation/river-path';
import type { Feedback } from '@/types/api';

export interface ContextLink {
  label: string;
  href: string;
  /** Public pages open in a new tab; admin editors stay in the workspace. */
  external: boolean;
}

export interface ContextFact {
  label: string;
  value: string;
}

export interface ContextLookups {
  rivers: Map<string, { name: string; slug: string; state: string }>;
  accessPoints: Map<
    string,
    { name: string; slug: string; riverSlug: string | null; riverState: string | null }
  >;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USGS_SITE = /^\d{8,15}$/;

export function isLookupId(id: string | null): id is string {
  return !!id && UUID.test(id);
}

/** Links for the place the feedback is about, best first. */
export function contextLinks(
  item: Pick<Feedback, 'contextType' | 'contextId'>,
  lookups: ContextLookups,
): ContextLink[] {
  const id = item.contextId;
  if (!id) return [];
  if (item.contextType === 'gauge' && USGS_SITE.test(id)) {
    return [{ label: `Gauge ${id}`, href: `/gauges/${id}`, external: true }];
  }
  if (item.contextType === 'river') {
    const river = lookups.rivers.get(id);
    return river
      ? [{ label: `${river.name} page`, href: riverPath(river.state, river.slug), external: true }]
      : [];
  }
  if (item.contextType === 'access_point' && isLookupId(id)) {
    const point = lookups.accessPoints.get(id);
    if (!point) return [];
    const links: ContextLink[] = [
      { label: `Edit ${point.name}`, href: `/admin/access-points/${id}`, external: false },
    ];
    if (point.riverSlug && point.riverState)
      links.push({
        label: 'Public page',
        href: riverAccessPath(point.riverState, point.riverSlug, point.slug),
        external: true,
      });
    return links;
  }
  return [];
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

function when(v: unknown): string | null {
  if (!text(v)) return null;
  const t = Date.parse(v);
  return Number.isNaN(t)
    ? null
    : new Date(t).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/Chicago',
        timeZoneName: 'short',
      });
}

type Reader = (data: Record<string, unknown>) => ContextFact | null;

/** Known context keys, in display order. Each reader consumes the keys it names. */
const READERS: [keys: string[], read: Reader][] = [
  [['riverName'], (d) => (text(d.riverName) ? { label: 'River', value: d.riverName } : null)],
  [['accessPointName'], (d) => (text(d.accessPointName) ? { label: 'Access point', value: d.accessPointName } : null)],
  [['riverMile'], (d) => (num(d.riverMile) ? { label: 'River mile', value: d.riverMile.toFixed(1) } : null)],
  [
    ['gaugeHeightFt', 'dischargeCfs'],
    (d) => {
      const parts = [
        num(d.gaugeHeightFt) && `${d.gaugeHeightFt} ft`,
        num(d.dischargeCfs) && `${Math.round(d.dischargeCfs).toLocaleString('en-US')} cfs`,
      ].filter(Boolean);
      return parts.length ? { label: 'Reading they saw', value: parts.join(' · ') } : null;
    },
  ],
  [
    ['conditionCode'],
    (d) => (text(d.conditionCode) ? { label: 'Condition shown', value: conditionDef(d.conditionCode).label } : null),
  ],
  [
    ['readingTimestamp', 'reportedAt'],
    (d) => {
      const reading = when(d.readingTimestamp);
      if (reading) return { label: 'Reading time', value: reading };
      const reported = when(d.reportedAt);
      return reported ? { label: 'Reported at', value: reported } : null;
    },
  ],
  [['query'], (d) => (text(d.query) ? { label: 'They searched for', value: d.query } : null)],
  [['type'], (d) => (text(d.type) ? { label: 'Place type', value: d.type.replace(/_/g, ' ') } : null)],
];

/**
 * Readable facts from known context keys. Keys in `handledElsewhere` (e.g. the
 * photo panel's) are skipped. The raw object stays available on request, so
 * an unrecognized key is never lost.
 */
export function contextFacts(
  data: Record<string, unknown> | null,
  handledElsewhere: string[] = [],
): ContextFact[] {
  if (!data || typeof data !== 'object') return [];
  const skip = new Set(handledElsewhere);
  const facts: ContextFact[] = [];
  for (const [keys, read] of READERS) {
    if (keys.some((k) => skip.has(k))) continue;
    const fact = read(data);
    if (fact) facts.push({ label: fact.label, value: fact.value.slice(0, 300) });
  }
  return facts;
}

/** Keys the reported-photo panel already shows. */
export const PHOTO_CONTEXT_KEYS = ['visualId', 'imageUrl', 'accessPointName', 'description'];
