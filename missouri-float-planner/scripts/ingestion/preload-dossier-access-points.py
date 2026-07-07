#!/usr/bin/env python3
"""Preload dossier access points as PENDING (approved=false) pins.

Placement, best-to-worst, per point:
  1. GEOCODED: geocode the name (+river+county+state) via Nominatim, snap the hit
     to the river line, and ACCEPT only if the snap is < 8 km (rejects wrong-river
     hits like "Mint Spring" -> Current River). The pin lands on the river at the
     geocoded spot.
  2. INTERPOLATED: fall back to river-mile position on the geometry (section-aware
     for Bourbeuse), else dossier order. Rougher; flagged.

Every pin sits on the correct river, approved=false + is_public=false (hidden from
the public until a human verifies and approves). Description records the method.

Usage:  python3 seed_access_points.py         # dry run
        python3 seed_access_points.py --write  # insert into prod
"""
import json, os, re, sys, math, time, urllib.request, urllib.parse

WRITE = '--write' in sys.argv
BASE = os.environ['SUPABASE_URL'].rstrip('/')
KEY = os.environ['SUPABASE_KEY']
DOSSIER_DIR = '/home/user/Eddy/missouri-float-planner/scripts/ingestion/dossiers'
FLAG = '⚠︎ AUTO-PRELOADED FROM RESEARCH DOSSIER (2026-07-07) — verify & drag to the exact ramp before approving.'
SNAP_ACCEPT_M = 8000  # geocode accepted only if it snaps within 8 km of the river
STATE = {'bourbeuse': 'Missouri', 'st-francis': 'Missouri', 'gasconade': 'Missouri',
         'black': 'Missouri', 'buffalo': 'Arkansas'}
RIVERNAME = {'bourbeuse': 'Bourbeuse River', 'st-francis': 'St. Francis River',
             'gasconade': 'Gasconade River', 'black': 'Black River', 'buffalo': 'Buffalo River'}

def req(method, path, body=None, extra=None):
    hdr = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
    if extra: hdr.update(extra)
    r = urllib.request.Request(BASE + path, method=method, headers=hdr,
                               data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as e:
        print(f'\n!! HTTP {e.code} on {method} {path}\n   {e.read().decode()[:600]}', file=sys.stderr)
        raise

# managing_agency has a CHECK constraint (fixed enum); ownership is freeform.
AGENCY = {'MDC': 'MDC', 'NPS': 'NPS', 'USFS': 'USFS', 'COE': 'COE',
          'Missouri State Parks': 'State Park', 'State Parks': 'State Park',
          'private': 'Private', 'Private': 'Private'}

def slugify(s):
    s = re.sub(r"[’'()/.,]", '', s.lower())
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')[:60]

def haversine(a, b):
    R = 6371000.0
    la1, lo1, la2, lo2 = map(math.radians, [a[1], a[0], b[1], b[0]])
    h = math.sin((la2-la1)/2)**2 + math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 2*R*math.asin(math.sqrt(h))

def interp(coords, frac):
    frac = max(0.0, min(1.0, frac))
    segs = [haversine(coords[i], coords[i+1]) for i in range(len(coords)-1)]
    total = sum(segs)
    if total == 0: return list(coords[0])
    target, acc = frac*total, 0.0
    for i, seg in enumerate(segs):
        if acc+seg >= target:
            t = (target-acc)/seg if seg else 0
            return [round(coords[i][0]+t*(coords[i+1][0]-coords[i][0]), 6),
                    round(coords[i][1]+t*(coords[i+1][1]-coords[i][1]), 6)]
        acc += seg
    return list(coords[-1])

def snap(coords, p):
    """Nearest point on polyline to p; returns (point, dist_m, fraction_along_line)."""
    lat0 = math.radians(p[1]); kx = math.cos(lat0)
    best = None; bestd = 1e18; besti = 0; bestt = 0.0
    for i in range(len(coords)-1):
        a, b = coords[i], coords[i+1]
        ax, ay = a[0]*kx, a[1]; bx, by = b[0]*kx, b[1]; px, py = p[0]*kx, p[1]
        dx, dy = bx-ax, by-ay
        L2 = dx*dx+dy*dy
        t = 0 if L2 == 0 else max(0, min(1, ((px-ax)*dx+(py-ay)*dy)/L2))
        cx, cy = a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1])
        d = haversine(p, [cx, cy])
        if d < bestd: bestd = d; best = [round(cx, 6), round(cy, 6)]; besti = i; bestt = t
    # fraction along the line = cumulative length to besti + t*seg / total
    segs = [haversine(coords[i], coords[i+1]) for i in range(len(coords)-1)]
    total = sum(segs) or 1.0
    frac = (sum(segs[:besti]) + bestt*segs[besti]) / total
    return best, bestd, frac

_geo_cache = {}
def geocode(q):
    if q in _geo_cache: return _geo_cache[q]
    url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode(
        {'format': 'json', 'limit': 3, 'countrycodes': 'us', 'q': q})
    try:
        r = urllib.request.Request(url, headers={'User-Agent': 'eddy-float-planner/1.0 (access-point geocoding)'})
        with urllib.request.urlopen(r, timeout=15) as resp:
            out = [[float(x['lon']), float(x['lat'])] for x in json.load(resp)]
    except Exception:
        out = []
    time.sleep(1.1)
    _geo_cache[q] = out
    return out

MILE_RE = re.compile(r'mile\s*([\d.]+)', re.I)
COUNTY_RE = re.compile(r'([A-Z][a-z]+)\s+County', re.I)

def whole_mile(slug, ap):
    m = MILE_RE.search(ap.get('notes') or '')
    if not m: return None
    mile = float(m.group(1).rstrip('.'))
    if slug == 'bourbeuse':
        return mile if (ap.get('section') or '').startswith('upper') else 59.0 + mile
    return mile

DISTINCTIVE = re.compile(r'\b(park|conservation|springs|recreation|landing|resort|lodge|garden)\b', re.I)

def try_geocode(slug, ap, coords):
    """Return (point, dist_m, fraction) for an accepted geocode, else None.

    Accept if the geocode snaps within 8 km of the river (use the snapped point).
    For DISTINCTIVE named places (parks/springs/etc.) also accept a looser hit up
    to 25 km, placing at the raw geocode (the named-place geocode is more
    trustworthy than my simplified geometry there). Bridges/fords are skipped —
    they geocode to the wrong feature too often.
    """
    name = ap.get('name', '')
    if re.search(r'\b(bridge|ford|confluence|low-water)\b', name, re.I):
        return None
    base = re.sub(r'\s*\([^)]*\)', '', name).strip()          # drop "(Hwy D)" etc.
    variants = {base, re.sub(r'\bMDC\b', '', base).strip(), re.sub(r'\baccess\b', '', base, flags=re.I).strip()}
    county = COUNTY_RE.search(ap.get('notes') or '')
    queries = []
    for nm in variants:
        if not nm: continue
        queries.append(f"{nm}, {RIVERNAME[slug]}, {STATE[slug]}")
        if county: queries.append(f"{nm}, {county.group(1)} County, {STATE[slug]}")
        queries.append(f"{nm}, {STATE[slug]}")
    distinctive = bool(DISTINCTIVE.search(name))
    best = None
    for q in queries:
        for cand in geocode(q):
            sp, d, frac = snap(coords, cand)
            if d < SNAP_ACCEPT_M:                              # tight: use snapped point
                if best is None or d < best[1]: best = (sp, d, frac)
            elif distinctive and d < 25000:                    # loose: trust the named geocode
                if best is None or d < best[1]: best = ([round(cand[0], 6), round(cand[1], 6)], d, frac)
        if best and best[1] < SNAP_ACCEPT_M:
            break
    return best

def main():
    plan = []
    for slug in ['bourbeuse', 'st-francis', 'gasconade', 'black', 'buffalo']:
        d = json.load(open(f'{DOSSIER_DIR}/{slug}.json'))
        aps = d.get('accessPoints') or []
        rows = req('GET', f'/rest/v1/rivers?select=id,geom,length_miles&slug=eq.{slug}')
        river_id, coords, geom_len = rows[0]['id'], rows[0]['geom']['coordinates'], float(rows[0]['length_miles'])
        miled = [(ap, whole_mile(slug, ap)) for ap in aps]
        have = [m for _, m in miled if m is not None]
        if slug == 'bourbeuse' and have:
            denom = max(have); f_start = max(0.0, (geom_len-denom)/geom_len)
        else:
            denom = geom_len; f_start = 0.0
        n = len(aps)
        # Pass 1: geocode everything geocodable → anchors.
        geo_by_idx = {}
        for idx, (ap, wm) in enumerate(miled):
            g = try_geocode(slug, ap, coords)
            if g: geo_by_idx[idx] = g
        mile_anchors = sorted((wm, geo_by_idx[i][2]) for i, (ap, wm) in enumerate(miled)
                              if i in geo_by_idx and wm is not None)
        rank_anchors = sorted((i, geo_by_idx[i][2]) for i in geo_by_idx)

        def lin(pairs, x):
            """Piecewise-linear (with end extrapolation) frac at x over sorted (x,frac)."""
            if x <= pairs[0][0]: (x0, f0), (x1, f1) = pairs[0], pairs[1]
            elif x >= pairs[-1][0]: (x0, f0), (x1, f1) = pairs[-2], pairs[-1]
            else:
                x0, f0 = max(p for p in pairs if p[0] <= x)
                x1, f1 = min(p for p in pairs if p[0] >= x)
            if x1 == x0: return f0
            return max(0.01, min(0.99, f0 + (f1-f0)*(x-x0)/(x1-x0)))

        # Pass 2: place each point. Priority: geocode > mile-between-anchors >
        # rank-between-anchors > raw mile model > order spread.
        for idx, (ap, wm) in enumerate(miled):
            if idx in geo_by_idx:
                g = geo_by_idx[idx]; lon, lat = g[0]; method = f'geocoded ~{g[1]/1000:.1f}km'
            elif wm is not None and len(mile_anchors) >= 2:
                lon, lat = interp(coords, lin(mile_anchors, wm)); method = f'mile-anchored {wm:.1f}'
            elif len(rank_anchors) >= 2:
                lon, lat = interp(coords, lin(rank_anchors, idx)); method = f'order-anchored {idx+1}/{n}'
            elif wm is not None:
                lon, lat = interp(coords, f_start + (wm/denom)*(1-f_start)); method = f'interp mile {wm:.1f}'
            else:
                frac = 0.5 if n == 1 else 0.1 + 0.8*idx/(n-1)
                lon, lat = interp(coords, frac); method = f'interp order {idx+1}/{n}'
            name = ap.get('name', 'Access'); src = ap.get('source')
            desc = f"{FLAG} [placed: {method}] {ap.get('notes','')}".strip()
            if src and src.startswith('http'): desc += f" [source: {src}]"
            plan.append((slug, method, name, lon, lat, {
                'river_id': river_id, 'name': name, 'slug': slugify(name),
                'type': ap.get('type') or 'access', 'types': [ap.get('type') or 'access'],
                'ownership': ap.get('ownership'), 'managing_agency': AGENCY.get(ap.get('ownership')),
                'description': desc[:2000],
                'official_site_url': src if (src and src.startswith('http')) else None,
                'location_orig': {'type': 'Point', 'coordinates': [lon, lat]},
                'location_snap': {'type': 'Point', 'coordinates': [lon, lat]},
                'river_mile_downstream': wm, 'river_mile_upstream': wm,
                'approved': False, 'is_public': False,
            }))
    seen = {}
    for *_, row in plan:
        k = (row['river_id'], row['slug']); seen[k] = seen.get(k, 0)+1
        if seen[k] > 1: row['slug'] = f"{row['slug']}-{seen[k]}"

    cur = None; ng = 0
    for slug, method, name, lon, lat, row in plan:
        if slug != cur: print(f"\n=== {slug} ==="); cur = slug
        tag = 'GEO ' if method.startswith('geocoded') else 'int '
        if method.startswith('geocoded'): ng += 1
        print(f"  {tag}{method:22s} {name[:34]:34s} -> {lat:.4f},{lon:.5f}")
    print(f"\nTOTAL {len(plan)} pts — {ng} geocoded+snapped, {len(plan)-ng} interpolated. All approved=false/is_public=false")
    if not WRITE:
        print("\nDRY RUN — re-run with --write to insert."); return
    hdr = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json',
           'Prefer': 'return=minimal'}
    tot = skip = 0
    for slug, method, name, lon, lat, row in plan:
        rq = urllib.request.Request(BASE + '/rest/v1/access_points', method='POST',
                                    headers=hdr, data=json.dumps([row]).encode())
        try:
            urllib.request.urlopen(rq); tot += 1
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            if e.code == 409:
                skip += 1  # already inserted on a prior run
            else:
                print(f"  !! {slug} / {name}: HTTP {e.code} {body[:300]}")
    print(f"\nDONE inserted {tot}, skipped {skip} existing")

main()
