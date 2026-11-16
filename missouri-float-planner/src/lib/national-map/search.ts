// src/lib/national-map/search.ts
// Search the national map by state, river, place or USGS station ID.
//
// Results are WHERE to go, never a judgment: selecting one frames the area
// once (later refreshes never move the camera) and, for a station, opens its
// detail.

import { stateName } from '@/lib/navigation/states';
import { NATIONAL_STATE_CODES } from './scope';
import type { Site } from './marks';

export type SearchResult =
  | { kind: 'state'; code: string; label: string; detail: string }
  | { kind: 'river'; name: string; label: string; detail: string; siteIndices: number[] }
  | { kind: 'site'; index: number; label: string; detail: string };

export interface SearchIndex {
  sites: Site[];
  states: Array<{ code: string; name: string; norm: string }>;
  rivers: Map<string, { name: string; indices: number[] }>;
  norms: string[];
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function buildSearchIndex(sites: Site[]): SearchIndex {
  const rivers = new Map<string, { name: string; indices: number[] }>();
  sites.forEach((s, i) => {
    if (!s.waterbody) return;
    const key = normalize(s.waterbody);
    if (!key) return;
    const entry = rivers.get(key) ?? { name: s.waterbody, indices: [] };
    entry.indices.push(i);
    rivers.set(key, entry);
  });
  return {
    sites,
    states: NATIONAL_STATE_CODES.map((code) => {
      const name = code === 'DC' ? 'District of Columbia' : stateName(code);
      return { code, name, norm: normalize(name) };
    }),
    rivers,
    norms: sites.map((s) => normalize(`${s.name} ${s.waterbody ?? ''} ${s.stateCode ?? ''}`)),
  };
}

const placeOf = (s: Site) =>
  [s.stateCode, s.kind === 'usgs' ? `USGS ${s.siteId}` : `NWS ${s.lid}`].filter(Boolean).join(' · ');

export function search(index: SearchIndex, raw: string, limit = 8): SearchResult[] {
  const q = normalize(raw);
  if (!q) return [];
  const out: SearchResult[] = [];

  // Station IDs: digits go straight to the station (USGS ids are 8–15 digits).
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 4 && digits === raw.trim().replace(/^usgs\s*/i, '')) {
    index.sites.forEach((s, i) => {
      if (out.length < limit && s.siteId?.startsWith(digits) && s.kind === 'usgs') {
        out.push({ kind: 'site', index: i, label: s.name, detail: placeOf(s) });
      }
    });
    return out;
  }
  // NWS location ids (e.g. "CELF1").
  if (/^[a-z]{3,4}\d$/.test(q)) {
    const up = q.toUpperCase();
    index.sites.forEach((s, i) => {
      if (s.lid === up) out.push({ kind: 'site', index: i, label: s.name, detail: placeOf(s) });
    });
  }

  for (const st of index.states) {
    if (st.norm.startsWith(q) || (q.length === 2 && st.code.toLowerCase() === q)) {
      out.push({ kind: 'state', code: st.code, label: st.name, detail: 'State' });
    }
  }

  const riverHits: SearchResult[] = [];
  index.rivers.forEach((r, key) => {
    if (key.startsWith(q) || key.includes(` ${q}`)) {
      riverHits.push({
        kind: 'river',
        name: r.name,
        label: r.name,
        detail: `${r.indices.length} gauge${r.indices.length === 1 ? '' : 's'}`,
        siteIndices: r.indices,
      });
    }
  });
  riverHits.sort((a, b) => (b.kind === 'river' ? b.siteIndices.length : 0) - (a.kind === 'river' ? a.siteIndices.length : 0));
  out.push(...riverHits.slice(0, 3));

  const starts: number[] = [];
  const contains: number[] = [];
  index.norms.forEach((n, i) => {
    if (n.startsWith(q)) starts.push(i);
    else if (n.includes(` ${q}`)) contains.push(i);
  });
  for (const i of [...starts, ...contains]) {
    if (out.length >= limit) break;
    const s = index.sites[i];
    out.push({ kind: 'site', index: i, label: s.name, detail: placeOf(s) });
  }
  return out.slice(0, limit);
}
