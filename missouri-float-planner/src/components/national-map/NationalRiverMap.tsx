'use client';

// /river-map — the national Live River Map.
//
// One map engine, three presentations of the same page:
//   * Explore — compact controls, legend, search, observation context, and a
//     detail panel (desktop) or bottom sheet (mobile) for a selected gauge.
//   * Map only — the default fullscreen: land, water, river network and data
//     marks. No words, no logos, no legends, no controls, no tooltips, no
//     cursor once idle. A deliberate tap / click / key reveals a temporary
//     tray; nothing else does.
//   * Display with details — fullscreen plus one restrained status line and
//     one rotating gauge, for wall use that wants a little context.
//
// What this page never does on its own: enter fullscreen, start a tour, ask
// for location, change the data view, replay the past, or move the camera.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildSearchIndex, type SearchResult } from '@/lib/national-map/search';
import {
  buildSites,
  classifyFlood,
  classifyFlow,
  classifySites,
  notableFlood,
  notableFlow,
  summarizeFlood,
  summarizeFlow,
  type Site,
} from '@/lib/national-map/marks';
import {
  DEFAULT_PREFS,
  PREFS_KEY,
  parsePrefs,
  parseSharedView,
  sharedViewQuery,
  type MapPrefs,
} from '@/lib/national-map/prefs';
import { FLOOD_STATUS_TEXT } from '@/lib/national-map/flood-status';
import { PALETTES, type MapTheme } from '@/lib/national-map/theme';
import { flowBandSentence } from '@shared/flow-band';
import { EddyIcon } from '@/components/ui/EddyIcon';
import MapStage, { type StageEvent, type StageHandle } from './MapStage';
import SiteDetail from './SiteDetail';
import {
  Chooser,
  DisplayDetails,
  ExplorePanel,
  FreshnessLine,
  FullscreenTray,
  HoverTip,
  MapControls,
  SearchBox,
} from './Chrome';
import { useNationalMapData } from './useNationalMapData';
import styles from './national-map.module.css';

const TRAY_IDLE_MS = 8000;
const CURSOR_IDLE_MS = 3000;
/** A snapshot older than this stops data-driven motion until a refresh succeeds. */
const LIVE_SNAPSHOT_MS = 2 * 3_600_000;

type Presentation = 'explore' | 'fullscreen';

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    setMatch(m.matches);
    const on = () => setMatch(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

export default function NationalRiverMap() {
  const data = useNationalMapData();
  const stage = useRef<StageHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);

  // ── Preferences (scoped to this page) and share links ───────────────────
  const [prefs, setPrefsState] = useState<MapPrefs>(DEFAULT_PREFS);
  const [shared, setShared] = useState<ReturnType<typeof parseSharedView> | null>(null);
  useEffect(() => {
    let stored = DEFAULT_PREFS;
    try {
      stored = parsePrefs(localStorage.getItem(PREFS_KEY));
    } catch {
      /* private mode: defaults */
    }
    const fromUrl = parseSharedView(window.location.search);
    setShared(fromUrl);
    setPrefsState(fromUrl.view ? { ...stored, view: fromUrl.view } : stored);
  }, []);
  const setPrefs = useCallback((patch: Partial<MapPrefs>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* storage is a convenience */
      }
      return next;
    });
  }, []);

  const systemDark = useMedia('(prefers-color-scheme: dark)');
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const desktop = useMedia('(min-width: 768px)');
  const wide = useMedia('(min-width: 1100px)');
  const theme: MapTheme = prefs.appearance === 'system' ? (systemDark ? 'dark' : 'light') : prefs.appearance;
  const palette = PALETTES[theme];
  const motion = prefs.motion && !reducedMotion;

  // ── Data ────────────────────────────────────────────────────────────────
  const { frame, catalog, now } = data;
  const sites = useMemo(() => (catalog ? buildSites(catalog, frame) : []), [catalog, frame]);
  const noaaOk = frame?.sources.noaaOk ?? false;
  const view = prefs.view;
  const classified = useMemo(() => classifySites(sites, view, now, noaaOk), [sites, view, now, noaaOk]);
  const flowSummary = useMemo(() => (frame && sites.length ? summarizeFlow(sites, now) : null), [frame, sites, now]);
  const floodSummary = useMemo(() => (frame && sites.length ? summarizeFlood(sites, now, noaaOk) : null), [frame, sites, now, noaaOk]);
  const searchIndex = useMemo(() => (sites.length ? buildSearchIndex(sites) : null), [sites]);
  const frameVersion = frame?.capturedAt ?? 0;
  // Data-driven motion only while the snapshot is recent and something is live.
  const dataLive =
    !!frame && now - frame.capturedAt < LIVE_SNAPSHOT_MS && (flowSummary?.live ?? 0) > 0 && data.status.lastError === null;

  // ── Selection (by key, so a refresh keeps it) ───────────────────────────
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const indexByKey = useMemo(() => new Map(sites.map((s, i) => [s.key, i])), [sites]);
  const selectedIndex = selectedKey !== null ? indexByKey.get(selectedKey) ?? null : null;
  const selected = selectedIndex !== null ? sites[selectedIndex] : null;
  const [chooser, setChooser] = useState<{ indices: number[]; x: number; y: number } | null>(null);
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const [featuredKey, setFeaturedKey] = useState<string | null>(null);
  const featuredIndex = featuredKey !== null ? indexByKey.get(featuredKey) ?? null : null;

  // ── Presentation ────────────────────────────────────────────────────────
  const [presentation, setPresentation] = useState<Presentation>('explore');
  const [native, setNative] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [cursorHidden, setCursorHidden] = useState(false);
  const trayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fullscreen = presentation === 'fullscreen';

  const armTray = useCallback(() => {
    if (trayTimer.current) clearTimeout(trayTimer.current);
    const tick = () => {
      // Stay open while a control inside has focus; check again later.
      if (trayRef.current?.contains(document.activeElement)) {
        trayTimer.current = setTimeout(tick, TRAY_IDLE_MS);
        return;
      }
      setTrayOpen(false);
    };
    trayTimer.current = setTimeout(tick, TRAY_IDLE_MS);
  }, []);

  const revealTray = useCallback(() => {
    setTrayOpen(true);
    armTray();
  }, [armTray]);

  const enterFullscreen = useCallback(() => {
    setSelectedKey(null);
    setChooser(null);
    setHover(null);
    setTrayOpen(false);
    const wasNational = stage.current?.isNational() ?? true;
    setPresentation('fullscreen');
    const el = rootRef.current;
    // Must run inside the click: browsers only grant fullscreen to a user gesture.
    if (el?.requestFullscreen) {
      el.requestFullscreen({ navigationUI: 'hide' })
        .then(() => setNative(true))
        .catch(() => setNative(false));
    } else {
      setNative(false);
    }
    if (wasNational) requestAnimationFrame(() => stage.current?.fitNational());
  }, []);

  const exitFullscreen = useCallback(() => {
    setPresentation('explore');
    setTrayOpen(false);
    setFeaturedKey(null);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);

  // Leaving native fullscreen any way (Escape, browser UI) leaves the presentation.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) {
        setNative(false);
        setPresentation((p) => (p === 'fullscreen' ? 'explore' : p));
        setTrayOpen(false);
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Keyboard in fullscreen: Escape exits (the fallback has no browser Escape);
  // any other key reveals the tray and moves focus into it.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        exitFullscreen();
        return;
      }
      if (!trayRef.current?.contains(document.activeElement)) {
        revealTray();
        if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          requestAnimationFrame(() => trayRef.current?.querySelector<HTMLElement>('button')?.focus());
        }
      } else {
        armTray();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, exitFullscreen, revealTray, armTray]);

  // Cursor hides after inactivity in fullscreen (independent of the tray:
  // pointer drift shows the cursor but never holds the tray open).
  useEffect(() => {
    if (!fullscreen) {
      setCursorHidden(false);
      return;
    }
    const show = () => {
      setCursorHidden(false);
      if (cursorTimer.current) clearTimeout(cursorTimer.current);
      cursorTimer.current = setTimeout(() => setCursorHidden(true), CURSOR_IDLE_MS);
    };
    show();
    window.addEventListener('pointermove', show);
    return () => {
      window.removeEventListener('pointermove', show);
      if (cursorTimer.current) clearTimeout(cursorTimer.current);
    };
  }, [fullscreen]);

  // Keep the screen awake while presenting (re-acquired after the tab returns).
  useEffect(() => {
    if (!fullscreen || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      if (document.hidden || cancelled) return;
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => {
          /* not granted (battery saver, unsupported): the display still works */
        });
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => {});
    };
  }, [fullscreen]);

  useEffect(
    () => () => {
      if (trayTimer.current) clearTimeout(trayTimer.current);
    },
    [],
  );

  // ── Share link (replaceState, debounced; never pushes history) ──────────
  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncUrl = useCallback(() => {
    if (urlTimer.current) clearTimeout(urlTimer.current);
    urlTimer.current = setTimeout(() => {
      const center = stage.current?.isNational() ? null : stage.current?.center() ?? null;
      const q = sharedViewQuery(view, center);
      const next = `${window.location.pathname}${q}`;
      if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, '', next);
    }, 400);
  }, [view]);
  useEffect(() => {
    syncUrl();
  }, [syncUrl]);

  // ── Map events ──────────────────────────────────────────────────────────
  const onTap = useCallback(
    (e: StageEvent | null) => {
      if (fullscreen) {
        // The first tap reveals controls; it never opens a gauge.
        revealTray();
        return;
      }
      setHover(null);
      if (!e) {
        setChooser(null);
        setSelectedKey(null);
        return;
      }
      if (e.indices.length > 1) {
        setChooser({ indices: e.indices.slice(0, 12), x: e.x, y: e.y });
        return;
      }
      setChooser(null);
      setSelectedKey(sites[e.indices[0]]?.key ?? null);
    },
    [fullscreen, revealTray, sites],
  );

  const onHover = useCallback((e: StageEvent | null) => {
    setHover(e ? { index: e.indices[0], x: e.x, y: e.y } : null);
  }, []);

  const loadDetail = data.loadDetail;

  const onPick = useCallback(
    (r: SearchResult) => {
      setChooser(null);
      if (r.kind === 'state') stage.current?.frameState(r.code);
      else if (r.kind === 'river') stage.current?.frameSites(r.siteIndices);
      else {
        // On phones the detail sheet covers the lower part of the map; center
        // the station in what stays visible above it.
        const cover = desktop ? 0 : Math.min(560, window.innerHeight * 0.62);
        stage.current?.focusSite(r.index, cover);
        setSelectedKey(sites[r.index]?.key ?? null);
      }
    },
    [sites, desktop],
  );

  // Escape in Explore peels the chooser, then the selection.
  useEffect(() => {
    if (fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (chooser) setChooser(null);
      else if (selectedKey) setSelectedKey(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, chooser, selectedKey]);

  const notable = useMemo(
    () => (fullscreen && prefs.displayDetails ? (view === 'flooding' ? notableFlood(sites, now, noaaOk) : notableFlow(sites, now)) : []),
    [fullscreen, prefs.displayDetails, view, sites, now, noaaOk],
  );
  const onFeature = useCallback((s: Site | null) => setFeaturedKey(s?.key ?? null), []);

  // Explore leaves room for its panel: beside the map on wide screens, above
  // it on phones (measured, so the full-US overview fits below the panel).
  const panelMeasure = useRef<HTMLDivElement>(null);
  const [panelBottom, setPanelBottom] = useState(0);
  useEffect(() => {
    const el = panelMeasure.current;
    const root = rootRef.current;
    if (!el || !root || desktop || fullscreen) return;
    const measure = () => setPanelBottom(Math.round(el.getBoundingClientRect().bottom - root.getBoundingClientRect().top));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [desktop, fullscreen]);
  const insets = useMemo(() => {
    if (fullscreen) return { top: 0, right: 0, bottom: 0, left: 0 };
    if (wide) return { top: 0, right: 64, bottom: 0, left: 340 };
    if (desktop) return { top: 0, right: 64, bottom: 0, left: 0 };
    return { top: panelBottom + 18, right: 0, bottom: 60, left: 0 };
  }, [fullscreen, wide, desktop, panelBottom]);

  const hoverSite = hover !== null ? sites[hover.index] : null;
  const hoverText = hoverSite
    ? view === 'flow'
      ? (() => {
          const c = classifyFlow(hoverSite, now);
          if (c === 'stale' || c === 'dormant') return 'Not current';
          if (c === 'no_comparison') return 'No seasonal comparison';
          if (c === 'hidden') return 'NWS forecast point';
          return flowBandSentence(c) ?? '';
        })()
      : (() => {
          const c = classifyFlood(hoverSite, now, noaaOk);
          if (c === 'no_nws') return 'No NWS forecast point';
          if (c === 'not_current') return 'NWS reading not current';
          return hoverSite.nws ? FLOOD_STATUS_TEXT[hoverSite.nws.observed].label : '';
        })()
    : '';

  const ariaLabel =
    view === 'flow'
      ? `Map of US river gauges compared with usual flow for this time of year.${
          flowSummary ? ` ${flowSummary.bands.much_higher} much higher, ${flowSummary.bands.much_lower} much lower than usual.` : ''
        } Use search to find a gauge; arrow keys pan, plus and minus zoom.`
      : `Map of official NWS flood status at US river gauges.${
          floodSummary && noaaOk ? ` ${floodSummary.major} major, ${floodSummary.moderate} moderate, ${floodSummary.minor} minor.` : ''
        } Use search to find a gauge; arrow keys pan, plus and minus zoom.`;

  const freshness = (
    <FreshnessLine
      capturedAt={frame?.capturedAt ?? null}
      lastSuccessAt={data.status.lastSuccessAt}
      lastError={data.status.lastError}
      now={now}
    />
  );

  const loading = !data.geometry && !data.geometryError;
  const fatal = data.geometryError;

  return (
    <div
      ref={rootRef}
      data-theme={theme}
      data-presentation={fullscreen ? (prefs.displayDetails ? 'display' : 'map-only') : 'explore'}
      className={`${styles.root} ${fullscreen && !native ? styles.fallbackFullscreen : ''} ${fullscreen && cursorHidden && !trayOpen ? styles.hideCursor : ''}`}
      style={{ background: palette.background }}
    >
      <div className={`absolute inset-0 ${fullscreen && motion ? styles.drift : ''}`}>
        <MapStage
          ref={stage}
          geometry={data.geometry}
          detail={data.detail}
          sites={sites}
          classified={classified}
          frameVersion={frameVersion}
          palette={palette}
          motion={motion}
          dataLive={dataLive}
          labels={!fullscreen}
          insets={insets}
          selectedIndex={fullscreen ? null : selectedIndex}
          featuredIndex={fullscreen && prefs.displayDetails ? featuredIndex : null}
          initialCenter={shared?.center ?? null}
          interactive={!fullscreen}
          ariaLabel={ariaLabel}
          onTap={onTap}
          onHover={onHover}
          onCameraChange={syncUrl}
          onNeedDetail={loadDetail}
        />
      </div>

      {/* Explore: everything below is absent in fullscreen. */}
      {!fullscreen && (
        <>
          {(loading || fatal) && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className={`${styles.panel} flex items-center gap-3 p-4`} role="status">
                <EddyIcon name="checkingGauge" size={40} />
                <p className="text-sm">{fatal ? 'The map could not load. Check your connection and reload.' : 'Loading the national map…'}</p>
              </div>
            </div>
          )}

          <div className="pointer-events-none absolute left-2 right-2 top-2 z-20 md:left-4 md:right-auto md:top-4">
            <ExplorePanel
              view={view}
              onView={(v) => setPrefs({ view: v })}
              palette={palette}
              flow={flowSummary}
              flood={floodSummary}
              noaaOk={noaaOk || !frame}
              freshness={freshness}
              searchBox={<SearchBox index={searchIndex} onPick={onPick} />}
              compact={!desktop}
              measureRef={panelMeasure}
            />
          </div>

          <div className={`pointer-events-none absolute right-2 z-20 md:right-4 ${selected && !desktop ? 'hidden' : ''}`} style={{ bottom: desktop ? 16 : 12 }}>
            <MapControls
              onZoomIn={() => stage.current?.zoomBy(1.6)}
              onZoomOut={() => stage.current?.zoomBy(1 / 1.6)}
              onReset={() => stage.current?.fitNational()}
              onFullscreen={enterFullscreen}
              appearance={prefs.appearance}
              onAppearance={(a) => setPrefs({ appearance: a })}
              motion={prefs.motion}
              onMotion={(m) => setPrefs({ motion: m })}
              reducedMotion={reducedMotion}
              displayDetails={prefs.displayDetails}
              onDisplayDetails={(d) => setPrefs({ displayDetails: d })}
              horizontal={!desktop}
            />
          </div>

          {chooser && (
            <Chooser
              sites={chooser.indices.map((index) => ({ index, site: sites[index] })).filter((c) => c.site)}
              x={chooser.x}
              y={chooser.y}
              onPick={(i) => {
                setChooser(null);
                setSelectedKey(sites[i]?.key ?? null);
              }}
              onClose={() => setChooser(null)}
            />
          )}

          {hoverSite && desktop && !chooser && hover && <HoverTip site={hoverSite} x={hover.x} y={hover.y} text={hoverText} />}

          {selected && (
            <div
              className={
                desktop
                  ? `${styles.panel} absolute bottom-4 right-20 top-4 z-30 w-[340px] overflow-y-auto`
                  : `${styles.panel} ${styles.sheet} absolute inset-x-2 bottom-2 z-30`
              }
            >
              {!desktop && <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full" style={{ background: 'var(--nm-hairline)' }} />}
              <SiteDetail
                site={selected}
                view={view}
                clock={now}
                noaaOk={noaaOk}
                capturedAt={frame?.capturedAt ?? null}
                onClose={() => setSelectedKey(null)}
              />
            </div>
          )}

        </>
      )}

      {fullscreen && (
        <>
          {prefs.displayDetails && (
            <DisplayDetails
              view={view}
              flow={flowSummary}
              flood={floodSummary}
              noaaOk={noaaOk}
              capturedAt={frame?.capturedAt ?? null}
              now={now}
              notable={notable}
              onFeature={onFeature}
            />
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-40 flex justify-center px-4">
            <FullscreenTray
              open={trayOpen}
              view={view}
              onView={(v) => {
                setPrefs({ view: v });
                armTray();
              }}
              displayDetails={prefs.displayDetails}
              onDisplayDetails={(d) => {
                setPrefs({ displayDetails: d });
                armTray();
              }}
              motion={prefs.motion}
              onMotion={(m) => {
                setPrefs({ motion: m });
                armTray();
              }}
              reducedMotion={reducedMotion}
              onExit={exitFullscreen}
              onActivity={armTray}
              trayRef={trayRef}
            />
          </div>
        </>
      )}
    </div>
  );
}
