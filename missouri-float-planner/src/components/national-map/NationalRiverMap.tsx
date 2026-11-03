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
  curateHighlights,
  HIGHLIGHT_SEPARATION,
  pickPulses,
  LIVE_REASON_TEXT,
  viewLiveState,
  summarizeFlood,
  summarizeFlow,
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
import { PALETTES, wallPalette, withFlowColors, type MapTheme } from '@/lib/national-map/theme';
import { flowBandSentence } from '@shared/flow-band';
import { EddyIcon } from '@/components/ui/EddyIcon';
import type { InfoTipColors } from '@/components/ui/InfoTip';
import {
  clipFromStart,
  clippedJourneys,
  journeyCaption,
  journeyFromSite,
  journeyTiming,
  pickJourneys,
  visibleJourneys,
  type Journey,
  type RoutePoint,
} from '@/lib/national-map/journeys';
import { calmSummary, rankChangeStories, rankStories, type Story } from '@/lib/national-map/stories';
import {
  extentSpan,
  inPolygons,
  lineRegions,
  parsePlace,
  placeExtent,
  placeMembers,
  placePolygons,
} from '@/lib/national-map/places';
import { buildLocator } from '@/lib/national-map/locator';
import { orientRivers, ratedCounts, ratedSections, type RatedSection } from '@/lib/national-map/rated';
import { useRatedRivers } from './useRatedRivers';
import {
  availableWindows,
  biggestChanges,
  changeSentence,
  changeStyle,
  classifyChangeSites,
  summarizeChange,
  WINDOW_MIN_SHARE,
  WINDOW_MS,
  type ChangeWindow,
  type SiteChange,
} from '@/lib/national-map/change';
import { usePriorFrame, useFrameHistory, useFloodTrend } from './usePriorFrame';
import { TrendStrip } from './TrendStrip';
import { componentOf, inRegion, projectComponent, regionSpan, type Region } from '@/lib/national-map/projection';
import { WallLegend } from './WallLegend';
import { WallStory } from './WallStory';
import { WallBrand } from './WallBrand';
import { RatedLegend } from './Legend';
import MapStage, { type StageEvent, type StageHandle, type StageView } from './MapStage';
import SiteDetail from './SiteDetail';
import {
  Chooser,
  ExplorePanel,
  FreshnessLine,
  ChangePanel,
  FullscreenTray,
  HoverTip,
  MapControls,
  RegionSelect,
  SearchBox,
} from './Chrome';
import { useNationalMapData } from './useNationalMapData';
import styles from './national-map.module.css';

const TRAY_IDLE_MS = 8000;
const CURSOR_IDLE_MS = 3000;
/** The fullscreen spotlight moves to the next highlight this often. */
const SPOTLIGHT_MS = 20_000;
/** "What changed" compares with a recorded frame this much older. */
const PRIOR_MS = 6 * 3_600_000;

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

export default function NationalRiverMap({ appQr = null }: { appQr?: { href: string; src: string } | null } = {}) {
  const data = useNationalMapData();
  const stage = useRef<StageHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);

  // ── Preferences (scoped to this page) and share links ───────────────────
  const [prefs, setPrefsState] = useState<MapPrefs>(DEFAULT_PREFS);
  const [shared, setShared] = useState<ReturnType<typeof parseSharedView> | null>(null);
  // The place the map is scoped to (?region=MO / ?region=huc05), or the
  // whole country. Carried by the share link, not stored: a bookmark keeps
  // it, a fresh visit to /river-map shows the country.
  const [placeKey, setPlaceKey] = useState<string | null>(null);
  const place = useMemo(() => parsePlace(placeKey), [placeKey]);
  useEffect(() => {
    let stored = DEFAULT_PREFS;
    try {
      stored = parsePrefs(localStorage.getItem(PREFS_KEY));
    } catch {
      /* private mode: defaults */
    }
    const fromUrl = parseSharedView(window.location.search);
    setShared(fromUrl);
    setPlaceKey(fromUrl.region);
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
  // Side layout (panel beside the map) needs width AND a landscape screen;
  // portrait tablets get the phone's stacked layout so the panel never sits
  // on the West. Short screens (landscape phones) start with the legend shut.
  const side = useMedia('(min-width: 768px) and (min-aspect-ratio: 1/1)');
  const short = useMedia('(max-height: 600px)');
  const narrow = useMedia('(max-width: 640px)');
  // The wall legend sits in the composition's left margin on wide screens;
  // narrower than ~1.45:1 there is no margin, so it becomes a bottom strip.
  const legendStrip = useMedia('(max-aspect-ratio: 29/20)') || narrow;
  const finePointer = useMedia('(hover: hover) and (pointer: fine)');
  const theme: MapTheme = prefs.appearance === 'system' ? (systemDark ? 'dark' : 'light') : prefs.appearance;
  // Fullscreen is the wall: its own brightness tiers and mark hierarchy
  // (theme.ts wallPalette, marks.ts wallStyle). Explore keeps everything.
  const [presentation, setPresentation] = useState<Presentation>('explore');
  const fullscreen = presentation === 'fullscreen';
  const wallText = prefs.wallText;
  // Measured boxes of the wall legend (strip height) and story column (width),
  // so the fit keeps geography out from under them.
  const legendRef = useRef<HTMLDivElement>(null);
  const [legendHeight, setLegendHeight] = useState(0);
  const [storyWidth, setStoryWidth] = useState(0);
  useEffect(() => {
    if (!fullscreen) return;
    // Strip: the legend section's height. Column: its right edge (the
    // wrapper is the absolutely positioned column itself).
    const target = () => (legendStrip ? legendRef.current?.firstElementChild : legendRef.current) ?? null;
    const measure = () => {
      const box = target()?.getBoundingClientRect();
      setLegendHeight(legendStrip && box ? Math.round(box.height) : 0);
      setStoryWidth(!legendStrip && box ? Math.round(box.right + 8) : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    const el = target();
    if (el) ro.observe(el);
    return () => ro.disconnect();
  }, [fullscreen, wallText, legendStrip]);
  const palette = useMemo(
    () => withFlowColors(fullscreen ? wallPalette(theme) : PALETTES[theme], theme, prefs.flowColors),
    [fullscreen, theme, prefs.flowColors],
  );
  const motion = prefs.motion && !reducedMotion;

  // ── Data ────────────────────────────────────────────────────────────────
  const { frame, catalog, now } = data;
  // Without the catalog there are no USGS positions — but NWS points carry
  // their own, so a failed catalog still draws them instead of an empty country.
  const sites = useMemo(() => (catalog || frame ? buildSites(catalog ?? [], frame) : []), [catalog, frame]);
  const noaaOk = frame?.sources.noaaOk ?? false;
  const view = prefs.view;

  // ── Change: the comparison window and the recorded frame that far back ──
  // Only windows the recorded history reaches are offered; until one is, the
  // view says when comparisons begin and draws no change marks.
  const frameHistory = useFrameHistory(view === 'change', frame?.capturedAt ?? null);
  // The national flooding trend: Explore's Flooding legend, and the wall's Story column.
  const floodTrend = useFloodTrend(view === 'flooding' && (!fullscreen || wallText === 'story'), frame?.capturedAt ?? null, place?.key ?? null);
  const windows = useMemo(() => (frameHistory ? availableWindows(frameHistory.oldest, frameHistory.newest) : []), [frameHistory]);
  const changeWindow: ChangeWindow | null = windows.includes(prefs.changeWindow) ? prefs.changeWindow : (windows[0] ?? null);
  const changePrior = usePriorFrame(view === 'change' && changeWindow !== null, frame, catalog, changeWindow ? WINDOW_MS[changeWindow] : 0, WINDOW_MIN_SHARE);
  const changeCtx = useMemo(
    () =>
      changePrior && changeWindow
        ? { prior: changePrior.sites, priorCapturedAt: changePrior.capturedAt, priorNoaaOk: changePrior.noaaOk, window: changeWindow }
        : null,
    [changePrior, changeWindow],
  );
  const changeResult = useMemo(
    () => (view === 'change' && changeCtx ? classifyChangeSites(sites, changeCtx, now, noaaOk, fullscreen) : null),
    [view, changeCtx, sites, now, noaaOk, fullscreen],
  );
  const changeSummary = useMemo(() => (changeResult ? summarizeChange(changeResult.changes) : null), [changeResult]);

  const classified = useMemo(
    () => (view === 'change' ? (changeResult?.classified ?? []) : classifySites(sites, view, now, noaaOk, fullscreen)),
    [view, changeResult, sites, now, noaaOk, fullscreen],
  );
  // No catalog means no USGS sites at all: say nothing about flow rather
  // than report zero gauges (the freshness line explains the outage).
  const flowSummary = useMemo(() => (frame && catalog && sites.length ? summarizeFlow(sites, now) : null), [frame, catalog, sites, now]);
  const floodSummary = useMemo(() => (frame && sites.length ? summarizeFlood(sites, now, noaaOk) : null), [frame, sites, now, noaaOk]);
  const searchIndex = useMemo(() => (catalog && sites.length ? buildSearchIndex(sites) : null), [catalog, sites]);

  // ── Place scope ─────────────────────────────────────────────────────────
  // Liveness stays national (the data's freshness is national); what is
  // counted, featured, pulsed and followed is the place's.
  const members = useMemo(() => (place ? placeMembers(sites, place) : null), [place, sites]);
  const placeSites = useMemo(() => (members ? sites.filter((_, i) => members[i]) : sites), [members, sites]);
  const shownFlow = useMemo(
    () => (members ? (frame && catalog && placeSites.length ? summarizeFlow(placeSites, now) : null) : flowSummary),
    [members, frame, catalog, placeSites, now, flowSummary],
  );
  const shownFlood = useMemo(
    () => (members ? (frame && placeSites.length ? summarizeFlood(placeSites, now, noaaOk) : null) : floodSummary),
    [members, frame, placeSites, now, noaaOk, floodSummary],
  );
  const extent = useMemo(
    () => (place && data.geometry && members ? placeExtent(data.geometry, sites, members, place) : null),
    [place, data.geometry, sites, members],
  );
  const placePolys = useMemo(() => (place && data.geometry ? placePolygons(data.geometry, place) : null), [place, data.geometry]);
  // A water-resources region keeps its trails and journeys on its own rivers
  // (each line assigned by its nearest gauges).
  const baseLineRegions = useMemo(
    () => (place?.kind === 'basin' && data.geometry ? lineRegions(data.geometry.rivers, sites) : null),
    [place, data.geometry, sites],
  );
  const detailLineRegions = useMemo(
    () => (place?.kind === 'basin' && data.detail ? lineRegions(data.detail.rivers, sites) : null),
    [place, data.detail, sites],
  );
  const trailKeep = useMemo(() => {
    if (place?.kind !== 'basin') return null;
    const mask = (r: Array<string | null> | null) => (r ? Uint8Array.from(r, (h) => (h === place.id ? 1 : 0)) : null);
    return { base: mask(baseLineRegions), detail: mask(detailLineRegions) ?? new Uint8Array(0) };
  }, [place, baseLineRegions, detailLineRegions]);
  /** Is a route point inside the place? (journeys) */
  const insidePlace = useMemo((): ((p: RoutePoint) => boolean) | null => {
    if (!place) return null;
    if (place.kind === 'state') return placePolys ? (p) => inPolygons(placePolys, p.component, p.x, p.y) : null;
    return baseLineRegions ? (p) => baseLineRegions[p.line] === place.id : null;
  }, [place, placePolys, baseLineRegions]);
  const outside = useMemo(
    () => (members ? { mask: Uint8Array.from(members, (m) => (m ? 0 : 1)), alpha: place?.kind === 'basin' ? 0.3 : 1 } : null),
    [members, place],
  );
  const locator = useMemo(() => (data.geometry ? buildLocator(data.geometry) : null), [data.geometry]);
  // Eddy's rated rivers in a state view: sections coloured by Eddy's float
  // condition at their gauges (rated.ts). Flow only — Eddy's condition colours
  // (orange "high", red "flood") would read as NWS flood categories in the
  // Flooding view, and Change has its own scale.
  const showRated = place?.kind === 'state' && view === 'flow';
  const ratedRivers = useRatedRivers(showRated);
  // Turned to run downstream once per dataset and network (not per reading):
  // the national network (base + detail, digitized downstream) confirms the
  // direction before trails claim one.
  const orientedRated = useMemo(
    () => (ratedRivers && data.geometry ? orientRivers(ratedRivers, [...data.geometry.rivers, ...(data.detail?.rivers ?? [])]) : null),
    [ratedRivers, data.geometry, data.detail],
  );
  const rated = useMemo(() => {
    if (!showRated || !orientedRated || !frame || !placePolys) return null;
    const inState = orientedRated.filter((r) =>
      r.coords.some(([lng, lat]) => {
        const c = componentOf(lng, lat);
        const [x, y] = projectComponent(c, lng, lat);
        return inPolygons(placePolys, c, x, y);
      }),
    );
    return inState.length ? ratedSections(inState, frame.gauges, now) : null;
  }, [showRated, orientedRated, frame, placePolys, now]);
  const ratedBySite = useMemo(() => {
    const m = new Map<string, { river: string; code: RatedSection['code'] }>();
    for (const sec of rated ?? []) if (sec.siteId && !m.has(sec.siteId)) m.set(sec.siteId, { river: sec.river, code: sec.code });
    return m;
  }, [rated]);
  const shownChange = useMemo(
    () => (changeResult ? (members ? summarizeChange(changeResult.changes.filter((_, i) => members[i])) : changeSummary) : null),
    [changeResult, members, changeSummary],
  );
  const frameVersion = frame?.capturedAt ?? 0;
  // Data-driven motion only while THE VIEW ON SCREEN is current: fresh USGS
  // readings say nothing about a Flooding view whose NOAA capture failed.
  const liveReason = viewLiveState({
    view,
    capturedAt: frame?.capturedAt ?? null,
    clock: now,
    refreshFailed: data.status.lastError !== null,
    noaaOk,
    flowLive: flowSummary?.live ?? 0,
    floodAssessed: floodSummary?.assessed ?? 0,
    changeReady: changeCtx !== null,
  });
  const dataLive = liveReason === 'live';
  const liveStatus = liveReason === 'live' ? null : LIVE_REASON_TEXT[liveReason];

  // ── Selection (by key, so a refresh keeps it) ───────────────────────────
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  /** Opened from search / chooser / keyboard / list: focus moves into the detail. */
  const [detailFocus, setDetailFocus] = useState(false);
  /** Where focus returns when the detail or chooser closes. */
  const focusOrigin = useRef<HTMLElement | null>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [rootSize, setRootSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setRootSize({ width: e.contentRect.width, height: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const restoreFocus = useCallback(() => {
    const origin = focusOrigin.current;
    focusOrigin.current = null;
    requestAnimationFrame(() => {
      if (origin && origin.isConnected && !origin.closest('[inert]')) origin.focus({ preventScroll: true });
      else stage.current?.focus();
    });
  }, []);
  const closeDetail = useCallback(() => {
    setSelectedKey(null);
    setDetailFocus(false);
    restoreFocus();
  }, [restoreFocus]);
  const indexByKey = useMemo(() => new Map(sites.map((s, i) => [s.key, i])), [sites]);
  const selectedIndex = selectedKey !== null ? indexByKey.get(selectedKey) ?? null : null;
  const selected = selectedIndex !== null ? sites[selectedIndex] : null;
  const [chooser, setChooser] = useState<{ indices: number[]; x: number; y: number } | null>(null);
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);

  // ── Presentation ────────────────────────────────────────────────────────
  const [native, setNative] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [cursorHidden, setCursorHidden] = useState(false);
  const trayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // How the viewer last interacted. A clicked button keeps focus, so "focus is
  // in the tray" cannot mean "someone is using it": only KEYBOARD focus holds
  // the tray open. Choose Flooding with the mouse, walk away, and the display
  // returns to clean.
  const keyboardModality = useRef(false);
  const armTray = useCallback(() => {
    if (trayTimer.current) clearTimeout(trayTimer.current);
    const tick = () => {
      const focusInTray = !!trayRef.current?.contains(document.activeElement);
      if (focusInTray && keyboardModality.current) {
        trayTimer.current = setTimeout(tick, TRAY_IDLE_MS);
        return;
      }
      // Hand focus back to the map before the tray goes inert.
      if (focusInTray) stage.current?.focus();
      setTrayOpen(false);
    };
    trayTimer.current = setTimeout(tick, TRAY_IDLE_MS);
  }, []);

  const revealTray = useCallback(() => {
    setTrayOpen(true);
    armTray();
  }, [armTray]);

  // The Explore view to return to when fullscreen ends.
  const preFullscreen = useRef<StageView | null>(null);
  // True between requestFullscreen() and its outcome: a fullscreenchange in
  // that window (some browsers fire one before the element is set) must not
  // end the presentation.
  const entering = useRef(false);

  const enterFullscreen = useCallback(() => {
    setSelectedKey(null);
    setChooser(null);
    setHover(null);
    setTrayOpen(false);
    const before = stage.current?.view() ?? null;
    preFullscreen.current = before;
    setPresentation('fullscreen');
    // The wall shows the whole country unless the reader had zoomed into a
    // region on purpose; then that region stays centred.
    if (!before || before.national || before.zoom < 1.6) stage.current?.fitNational();
    const el = rootRef.current;
    // Must run inside the click: browsers only grant fullscreen to a user gesture.
    if (el?.requestFullscreen) {
      entering.current = true;
      el.requestFullscreen({ navigationUI: 'hide' })
        .then(() => setNative(true))
        .catch(() => setNative(false))
        .finally(() => {
          entering.current = false;
        });
    } else {
      setNative(false);
    }
    // Focus lands on the map, whose fullscreen label says how to reach the tray.
    requestAnimationFrame(() => stage.current?.focus());
  }, []);

  const leaveFullscreen = useCallback(() => {
    setPresentation('explore');
    setTrayOpen(false);
    setNative(false);
    // Back to the view the reader had, at the new size (centre + zoom).
    const before = preFullscreen.current;
    preFullscreen.current = null;
    if (before) stage.current?.restoreView(before);
    else stage.current?.fitNational();
    // Back to the control that entered fullscreen, never to <body>.
    requestAnimationFrame(() => requestAnimationFrame(() => fullscreenButton.current?.focus({ preventScroll: true })));
  }, []);

  const exitFullscreen = useCallback(() => {
    leaveFullscreen();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, [leaveFullscreen]);

  // Leaving native fullscreen any way (Escape, browser UI) leaves the presentation.
  const presentationRef = useRef(presentation);
  presentationRef.current = presentation;
  useEffect(() => {
    const onChange = () => {
      if (entering.current || document.fullscreenElement) return;
      if (presentationRef.current === 'fullscreen') leaveFullscreen();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [leaveFullscreen]);

  // Keyboard in fullscreen: Escape exits (the fallback has no browser Escape);
  // any other key reveals the tray and moves focus into it.
  useEffect(() => {
    if (!fullscreen) return;
    const onPointer = () => {
      keyboardModality.current = false;
    };
    window.addEventListener('pointerdown', onPointer, true);
    const onKey = (e: KeyboardEvent) => {
      keyboardModality.current = true;
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
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer, true);
    };
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

  // The in-page fallback (no Fullscreen API — iPhone Safari) must cover the
  // site header. The page wrapper is a fixed-position stacking context below
  // the header's z-50, which traps any z-index set on the map itself; the
  // wrapper lifts itself while a child carries data-fallback (styles.pageFrame).
  const fallback = fullscreen && !native;

  // ── Share link (replaceState, debounced; never pushes history) ──────────
  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncUrl = useCallback(() => {
    if (urlTimer.current) clearTimeout(urlTimer.current);
    // Next.js patches history.replaceState. Until its App Router has
    // initialized, history.state is null and the patch dispatches into a
    // router that does not exist yet: "Router action dispatched before
    // initialization", reported globally by React's startTransition — not
    // thrown, so a try/catch never sees it. Once initialized, Next's own
    // entry carries `__NA` and a replace with that state passes straight
    // through. So wait for it; a slow cold start can get here first.
    const write = (attempt: number) => {
      const state = window.history.state as { __NA?: unknown } | null;
      if (!state || !state.__NA) {
        if (attempt < 40) urlTimer.current = setTimeout(() => write(attempt + 1), 250);
        return;
      }
      const center = stage.current?.isNational() ? null : stage.current?.center() ?? null;
      const q = sharedViewQuery(view, center, place?.key ?? null);
      const next = `${window.location.pathname}${q}`;
      if (next === `${window.location.pathname}${window.location.search}`) return;
      try {
        window.history.replaceState(window.history.state, '', next);
      } catch {
        if (attempt < 10) urlTimer.current = setTimeout(() => write(attempt + 1), 500);
      }
    };
    urlTimer.current = setTimeout(() => write(0), 400);
  }, [view, place]);
  useEffect(() => {
    syncUrl();
  }, [syncUrl]);

  // ── Map events ──────────────────────────────────────────────────────────
  const [announce, setAnnounce] = useState('');
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
      if (e.keyboard) focusOrigin.current = document.activeElement as HTMLElement | null;
      if (e.indices.length === 0) {
        if (e.keyboard) setAnnounce('No gauges at the centre of the map. Pan or zoom, then press Enter again.');
        return;
      }
      if (e.indices.length > 1) {
        // Every gauge here — nothing is dropped from the list.
        focusOrigin.current = document.activeElement as HTMLElement | null;
        setChooser({ indices: e.indices, x: e.x, y: e.y });
        return;
      }
      setChooser(null);
      setDetailFocus(!!e.keyboard);
      setSelectedKey(sites[e.indices[0]]?.key ?? null);
    },
    [fullscreen, revealTray, sites],
  );

  const onHover = useCallback((e: StageEvent | null) => {
    setHover(e ? { index: e.indices[0], x: e.x, y: e.y } : null);
  }, []);

  const loadDetail = data.loadDetail;
  // Tributary and small-stream trails need the detail network (~220 KB
  // compressed). Fetch it once motion runs on a wall or a wide screen; phones
  // still fetch it only on zooming in, where its lines are drawn.
  const trailsRunning = motion && dataLive;
  useEffect(() => {
    if (trailsRunning && (fullscreen || side)) loadDetail();
  }, [trailsRunning, fullscreen, side, loadDetail]);

  /** Open a site's details from a list (search, notable list): frame it, focus the detail. */
  const openSite = useCallback(
    (index: number) => {
      focusOrigin.current = document.activeElement as HTMLElement | null;
      setChooser(null);
      // On phones the sheet covers the lower half; centre the station above it
      // (the sheet's measured height corrects this once it renders).
      stage.current?.focusSite(index, side ? 0 : Math.round(rootSize.height * 0.5));
      setDetailFocus(true);
      setSelectedKey(sites[index]?.key ?? null);
    },
    [sites, side, rootSize.height],
  );

  const onPick = useCallback(
    (r: SearchResult) => {
      setChooser(null);
      if (r.kind === 'state') stage.current?.frameState(r.code);
      else if (r.kind === 'river') stage.current?.frameSites(r.siteIndices);
      else openSite(r.index);
    },
    [openSite],
  );

  // Escape in Explore peels the hover tip, the chooser, then the selection.
  useEffect(() => {
    if (fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (hover) setHover(null);
      if (chooser) {
        setChooser(null);
        restoreFocus();
      } else if (selectedKey) closeDetail();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, chooser, selectedKey, hover, restoreFocus, closeDetail]);


  // A few meaningful events spread across the country (curateHighlights).
  // Nothing is highlighted while the view is not live — emphasis is a claim
  // that something is happening now.
  const highlights = useMemo(
    () => (dataLive ? curateHighlights(placeSites, view, now, noaaOk, 8) : []),
    [dataLive, placeSites, view, now, noaaOk],
  );
  const notableListed = useMemo(() => {
    // Change: the biggest trustworthy changes, each with its own sentence.
    if (view === 'change') {
      if (!changeResult || !changeWindow) return [];
      const items = changeResult.changes
        .map((change, index) => ({ index, site: sites[index], change }))
        .filter(({ index }) => !members || members[index]);
      return biggestChanges(items, 8).map(({ index, site, change }) => ({
        index,
        site,
        style: changeStyle(change),
        detail: changeSentence(change, changeWindow),
      }));
    }
    return highlights.map((site) => ({ index: indexByKey.get(site.key) ?? -1, site })).filter((n) => n.index >= 0);
  }, [view, changeResult, changeWindow, sites, highlights, indexByKey, members]);
  // The fullscreen sequence: one focal point at a time, the camera still.
  //   * "Follow the river" (motion on, view live): a highlight travels a real
  //     network to its outlet, holds so the connection reads, then hands off;
  //   * a featured story: the current development most worth attention
  //     (stories.ts — severity, change since a recorded frame ~6 h older,
  //     freshness, variety, not just shown), marked by the spotlight ring and,
  //     in Story mode, told in the card with its 24-hour water level.
  // They alternate: discover a river → notice what is happening → another
  // place. With motion off the first story rests and no journey runs.
  //
  // A regional wall (fullscreen kept a deliberate zoom) draws its sequence
  // from what it can SEE: stories from visible gauges, spaced for the zoom,
  // and journeys clipped to the stretch of river on screen. The national wall
  // keeps the national sequence.
  const [stageRegion, setStageRegion] = useState<Region | null>(null);
  // A scoped place takes over: its own gauges, outline and rivers. Otherwise
  // a deliberately zoomed wall plays what it can see.
  const region = fullscreen && !place ? stageRegion : null;
  const nationalSpan = data.geometry ? data.geometry.components.l48.maxX - data.geometry.components.l48.minX : 774;
  const placeSpan = extent ? extentSpan(extent) : 0;
  const separation = place && placeSpan > 0
    ? (HIGHLIGHT_SEPARATION * placeSpan) / nationalSpan
    : region
      ? (HIGHLIGHT_SEPARATION * regionSpan(region)) / nationalSpan
      : HIGHLIGHT_SEPARATION;

  // What changed (stories in Flow / Flooding): a recorded frame about
  // PRIOR_MS older, fullscreen only. None yet, or one too close in time,
  // means no change claims — never a guess.
  const prior = usePriorFrame(fullscreen && view !== 'change', frame, catalog, PRIOR_MS, 0.5);

  const storySites = useMemo(
    () => (place ? placeSites : region ? sites.filter((x) => inRegion(region, x.component, x.x, x.y)) : sites),
    [place, placeSites, region, sites],
  );
  // Change view: stories are the biggest trustworthy changes over the window.
  const changeBySite = useMemo(() => {
    const m = new Map<string, SiteChange>();
    changeResult?.changes.forEach((c, i) => m.set(sites[i].key, c));
    return m;
  }, [changeResult, sites]);
  const rankFor = useCallback(
    (recentKeys: string[]): Story[] => {
      if (view === 'change') {
        if (!changeWindow) return [];
        const entries = storySites.flatMap((site) => {
          const change = changeBySite.get(site.key);
          return change ? [{ site, change }] : [];
        });
        return rankChangeStories({ entries, window: changeWindow, recent: recentKeys, separation });
      }
      return rankStories({ sites: storySites, prior, view, clock: now, noaaOk, recent: recentKeys, separation });
    },
    [view, changeWindow, storySites, changeBySite, prior, now, noaaOk, separation],
  );
  const storyPool = useMemo(() => (fullscreen && dataLive ? rankFor([]) : []), [fullscreen, dataLive, rankFor]);
  // On the wall only a few geographically distinct floods pulse; every
  // severity symbol stays drawn. Spacing follows the view, like the stories.
  const pulses = useMemo(() => {
    if (!fullscreen) return null;
    const shown = members
      ? classified.filter((c) => members[c.index])
      : region
        ? classified.filter((c) => inRegion(region, sites[c.index].component, sites[c.index].x, sites[c.index].y))
        : classified;
    return pickPulses(sites, shown, 6, separation);
  }, [fullscreen, members, region, classified, sites, separation]);
  const rivers = data.geometry?.rivers ?? null;
  const journeys = useMemo(() => {
    if (!rivers) return [];
    if (place) return insidePlace && placeSpan > 0 ? clippedJourneys(rivers, insidePlace, placeSpan, { count: 6, minShare: 0.25 }) : [];
    return region ? visibleJourneys(rivers, region) : pickJourneys(rivers);
  }, [rivers, place, insidePlace, placeSpan, region]);
  const journeysOn = fullscreen && motion && dataLive && journeys.length > 0;
  const [step, setStep] = useState(0);
  const journeyKey = journeys.map((j) => `${j.steps[0]?.line}:${Math.round(j.start)}`).join('|');
  useEffect(() => setStep(0), [journeyKey, view, fullscreen, placeKey]);
  // Story mode opens on its featured event — the card is the point of that
  // mode; the legend and map-only displays open on a river journey. Then they
  // alternate. With no story every step is a journey.
  const hasStories = storyPool.length > 0;
  const storyFirst = wallText === 'story';
  const journeyStep = journeysOn && (!hasStories || step % 2 === (storyFirst ? 1 : 0));
  const storyStep = fullscreen && !journeyStep && hasStories;
  // A story is chosen when its turn starts and kept for the turn; what was
  // just shown steps back next time (rankStories' recency rule).
  const [featured, setFeatured] = useState<{ story: Story | null; turn: number } | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const pickedFor = useRef<string>('');
  const storyTurns = useRef(0);
  const lastStory = useRef<Story | null>(null);
  useEffect(() => {
    setRecent([]);
    storyTurns.current = 0;
    lastStory.current = null;
  }, [view, fullscreen, placeKey]);
  useEffect(() => {
    if (!storyStep) return;
    const turn = `${view}:${placeKey ?? ''}:${step}`;
    if (pickedFor.current === turn) return;
    pickedFor.current = turn;
    const pick = rankFor(recent)[0] ?? null;
    setFeatured({ story: pick, turn: storyTurns.current++ });
    lastStory.current = pick;
    if (pick) setRecent((r) => [...r, pick.site.key].slice(-8));
  }, [storyStep, step, view, placeKey, rankFor, recent]);
  // A journey is chosen when its turn starts. Right after a story, it follows
  // THAT gauge's water downstream when the gauge stands on a river of the
  // national network ("where does this water go"); otherwise it is the next
  // route in a rotation that starts at a different route each hour and
  // carries on across view changes — the wall no longer opens on the same
  // river every time.
  const [turnJourney, setTurnJourney] = useState<{ turn: string; journey: Journey; from: Story['site'] | null } | null>(null);
  const journeyPickedFor = useRef<string>('');
  const journeyCursor = useRef<number | null>(null);
  const journeyTurn = `${view}:${placeKey ?? ''}:${step}`;
  useEffect(() => {
    if (!journeyStep || !rivers || !journeys.length) return;
    if (journeyPickedFor.current === journeyTurn) return;
    journeyPickedFor.current = journeyTurn;
    const from = lastStory.current?.site ?? null;
    lastStory.current = null;
    let linked = from ? journeyFromSite(rivers, from) : null;
    if (linked && insidePlace) linked = clipFromStart(linked, rivers, insidePlace);
    else if (linked && region) linked = clipFromStart(linked, rivers, (p) => inRegion(region, p.component, p.x, p.y));
    if (linked && from) {
      setTurnJourney({ turn: journeyTurn, journey: linked, from });
      return;
    }
    if (journeyCursor.current === null) journeyCursor.current = Math.floor(Date.now() / 3_600_000);
    const next = journeys[journeyCursor.current % journeys.length];
    journeyCursor.current++;
    setTurnJourney({ turn: journeyTurn, journey: next, from: null });
  }, [journeyStep, journeyTurn, journeys, rivers, insidePlace, region]);
  const journey = journeyStep && turnJourney?.turn === journeyTurn ? turnJourney.journey : null;
  const journeyFrom = journey ? turnJourney?.from ?? null : null;
  const actMs = journey ? journeyTiming(journey).totalMs : SPOTLIGHT_MS;
  const advances = fullscreen && motion && (journeysOn || storyPool.length > 1);
  useEffect(() => {
    if (!advances) return;
    const t = setTimeout(() => setStep((v) => v + 1), actMs);
    return () => clearTimeout(t);
  }, [advances, actMs, step]);
  const story = storyStep ? (featured?.story ?? null) : null;
  const sequence = story && featured ? { count: Math.min(6, storyPool.length), index: featured.turn % Math.min(6, storyPool.length) } : null;
  const spotlight = story?.site ?? null;
  const spotlightIndex = spotlight ? indexByKey.get(spotlight.key) ?? null : null;
  // Story mode's card: the journey, the featured event, or — when nothing in
  // view deserves a story — a calm card that says so with the counts.
  const calm =
    fullscreen && wallText === 'story' && dataLive && !hasStories
      ? calmSummary(view, {
          flow: shownFlow,
          flood: noaaOk ? shownFlood : null,
          change: shownChange,
          window: changeWindow,
          place: place?.name ?? null,
          rated: rated ? ratedCounts(rated) : null,
        })
      : null;
  const storyJourney =
    journey && !calm
      ? { kicker: journeyFrom ? `Downstream from ${journeyFrom.name}` : 'Following the river', caption: journeyCaption(journey) }
      : null;
  const regionStates = place?.kind === 'state' ? [place.id] : null;
  const act = journey ? 'journey' : spotlight ? 'spot' : 'none';

  // Explore leaves room for its panel: beside the map in the side layout
  // (measured width), above it otherwise (measured height of the always-visible
  // rows, so the full-US overview fits below and an open legend overlays).
  const panelMeasure = useRef<HTMLDivElement>(null);
  const panelBox = useRef<HTMLDivElement>(null);
  const [panelBottom, setPanelBottom] = useState(0);
  const [panelRight, setPanelRight] = useState(340);
  useEffect(() => {
    const top = panelMeasure.current;
    const box = panelBox.current;
    const root = rootRef.current;
    if (!top || !box || !root || fullscreen) return;
    const measure = () => {
      const r = root.getBoundingClientRect();
      setPanelBottom(Math.round(top.getBoundingClientRect().bottom - r.top));
      setPanelRight(Math.round(box.getBoundingClientRect().right - r.left));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(top);
    ro.observe(box);
    return () => ro.disconnect();
  }, [side, fullscreen]);
  const insets = useMemo(() => {
    if (fullscreen) {
      // The side legend sits in the composition's open left margin (the
      // Pacific above Alaska), so it reserves nothing; a bottom strip does.
      // Story mode keeps its column clear of the map.
      const bottom = wallText !== 'none' && legendStrip ? legendHeight + 12 : 0;
      const left = wallText === 'story' && !legendStrip ? storyWidth : 0;
      return { top: 0, right: 0, bottom, left };
    }
    if (side) return { top: 0, right: 64, bottom: 0, left: panelRight + 16 };
    return { top: panelBottom + 18, right: 0, bottom: 60, left: 0 };
  }, [fullscreen, side, panelBottom, panelRight, wallText, legendStrip, legendHeight, storyWidth]);
  const insetsTop = insets.top;

  // Phones: keep the selected gauge clear of the bottom sheet (measured).
  useEffect(() => {
    if (side || selectedIndex === null) return;
    const el = sheetRef.current;
    if (!el) return;
    const check = () => stage.current?.ensureVisible(selectedIndex, { top: insetsTop, bottom: el.offsetHeight + 8 });
    const raf = requestAnimationFrame(check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [side, selectedIndex, insetsTop]);

  const hoverSite = hover !== null ? sites[hover.index] : null;
  const selectedChange = (() => {
    if (view !== 'change' || selectedIndex === null || !changeResult || !changeWindow) return null;
    const c = changeResult.changes[selectedIndex];
    return c ? { style: changeStyle(c), text: changeSentence(c, changeWindow) } : null;
  })();
  const hoverChange = hover !== null && changeResult && changeWindow ? changeResult.changes[hover.index] : null;
  const hoverText = hoverSite
    ? view === 'change'
      ? hoverChange
        ? changeSentence(hoverChange, changeWindow!)
        : ''
      : view === 'flow'
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

  const exploreKeys = ' Arrow keys pan, plus and minus zoom, Enter lists the gauges at the centre ring; or use search.';
  const placePrefix = place ? `${place.name}. ` : '';
  const ariaLabel = fullscreen
    ? `Live River Map${place ? `, ${place.name}` : ''}, fullscreen. Press Tab for controls, Escape to exit.`
    : view === 'change'
      ? `${placePrefix}Map of how US rivers changed over the ${changeWindow === '6h' ? 'last 6 hours' : 'last 24 hours'}.${
          shownChange
            ? ` ${shownChange.counts.flood_up} rose in flood category, ${shownChange.counts.flood_down} fell; ${
                shownChange.counts.rising_fast + shownChange.counts.rising
              } rising, ${shownChange.counts.falling_fast + shownChange.counts.falling} falling.`
            : ' Change history is still being recorded.'
        }${exploreKeys}`
      : view === 'flow'
      ? `${placePrefix}Map of US river gauges compared with usual flow for this time of year.${
          shownFlow ? ` ${shownFlow.bands.much_higher} much higher, ${shownFlow.bands.much_lower} much lower than usual.` : ''
        }${exploreKeys}`
      : `${placePrefix}Map of official NWS flood status at US river gauges.${
          shownFlood && noaaOk ? ` ${shownFlood.major} major, ${shownFlood.moderate} moderate, ${shownFlood.minor} minor.` : ''
        }${exploreKeys}`;

  const infoColors: InfoTipColors =
    theme === 'dark'
      ? { trigger: '#C2BAAC', triggerBorder: '#4A9AAD', popBg: '#0F2D35', popBorder: '#4A9AAD', title: '#F2EAD8', body: '#C2BAAC', focus: '#A3D1DB' }
      : { trigger: '#6B6459', triggerBorder: '#857D70', popBg: '#FFFFFF', popBorder: '#1D525F', title: '#2D2A24', body: '#524D43', focus: '#1D525F' };

  const freshness = (
    <FreshnessLine
      capturedAt={frame?.capturedAt ?? null}
      lastSuccessAt={data.status.lastSuccessAt}
      lastError={data.status.lastError}
      catalogError={data.catalogError}
      now={now}
    />
  );

  const loading = !data.geometry && !data.geometryError;
  const fatal = data.geometryError;

  const stageEl = (
    <div
      className={`absolute inset-0 ${fullscreen && motion ? styles.drift : ''} ${frame && !dataLive ? styles.subdued : ''}`}
      data-live={dataLive ? 'true' : 'false'}
      data-act={act}
      data-region={place ? 'place' : region ? 'regional' : 'national'}
      data-place={place?.key ?? 'national'}
    >
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
        featuredIndex={spotlightIndex}
        initialCenter={shared?.center ?? null}
        interactive={!fullscreen}
        wall={fullscreen}
        journey={journey}
        pulses={pulses}
        onRegion={setStageRegion}
        ariaLabel={ariaLabel}
        onTap={onTap}
        onHover={onHover}
        onCameraChange={syncUrl}
        onNeedDetail={loadDetail}
        home={extent}
        outside={outside}
        placePolys={placePolys}
        trailKeep={trailKeep}
        riverLabels={prefs.riverNames && (fullscreen ? !!place : true)}
        rated={rated}
      />
    </div>
  );

  return (
    <div
      ref={rootRef}
      data-theme={theme}
      data-presentation={fullscreen ? (wallText === 'none' ? 'map-only' : wallText === 'story' ? 'story' : 'legend') : 'explore'}
      data-fallback={fallback ? 'true' : undefined}
      className={`${styles.root} ${fallback ? styles.fallbackFullscreen : ''} ${fullscreen && cursorHidden && !trayOpen ? styles.hideCursor : ''}`}
      style={{ background: palette.background }}
    >
      {/* Explore chrome comes first in the DOM so the heading and search are
          the first stops for keyboard and screen-reader users; the map stage
          follows (it paints beneath them: they carry z-index, it does not). */}
      {!fullscreen && (
        <>
          <div className="pointer-events-none absolute left-2 right-2 top-2 bottom-2 z-20 flex flex-col items-stretch md:items-start md:left-4 md:right-auto md:top-4 md:bottom-4">
            <ExplorePanel
              view={view}
              onView={(v) => setPrefs({ view: v })}
              palette={palette}
              flow={shownFlow}
              flood={shownFlood}
              noaaOk={noaaOk || !frame}
              freshness={freshness}
              searchBox={<SearchBox index={searchIndex} unavailable={!!data.catalogError} onPick={onPick} />}
              compact={!side}
              short={short}
              measureRef={panelMeasure}
              panelRef={panelBox}
              notable={notableListed}
              clock={now}
              onPickSite={openSite}
              infoColors={infoColors}
              floodTrend={view === 'flooding' ? <TrendStrip points={floodTrend} palette={palette} wall={false} /> : undefined}
              regionSelect={<RegionSelect place={place} onPlace={setPlaceKey} />}
              ratedLegend={rated ? <RatedLegend palette={palette} /> : undefined}
              changePanel={
                view === 'change' ? (
                  <ChangePanel
                    windows={windows}
                    window={changeWindow}
                    onWindow={(w) => setPrefs({ changeWindow: w })}
                    summary={shownChange}
                    palette={palette}
                    oldest={frameHistory?.oldest ?? null}
                    infoColors={infoColors}
                  />
                ) : undefined
              }
            />
          </div>

          {(loading || fatal) && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className={`${styles.panel} flex items-center gap-3 p-4`} role="status">
                <EddyIcon name="checkingGauge" size={40} />
                <p className="text-sm">{fatal ? 'The map could not load. Check your connection and reload.' : 'Loading the national map…'}</p>
              </div>
            </div>
          )}

          <div
            className={`pointer-events-none absolute right-2 z-20 md:right-4 ${selected && !side ? 'hidden' : ''}`}
            style={{ bottom: side ? 16 : 12 }}
          >
            <MapControls
              onZoomIn={() => stage.current?.zoomBy(1.6)}
              onZoomOut={() => stage.current?.zoomBy(1 / 1.6)}
              onReset={() => stage.current?.fitNational()}
              resetLabel={place ? `Show all of ${place.name}` : 'Show the whole country'}
              onFullscreen={enterFullscreen}
              appearance={prefs.appearance}
              onAppearance={(a) => setPrefs({ appearance: a })}
              motion={prefs.motion}
              onMotion={(m) => setPrefs({ motion: m })}
              reducedMotion={reducedMotion}
              wallText={wallText}
              onWallText={(t) => setPrefs({ wallText: t })}
              flowColors={prefs.flowColors}
              onFlowColors={(c) => setPrefs({ flowColors: c })}
              riverNames={prefs.riverNames}
              onRiverNames={(on) => setPrefs({ riverNames: on })}
              horizontal={!side}
              fullscreenRef={fullscreenButton}
            />
          </div>

          {chooser && (
            <Chooser
              sites={chooser.indices.map((index) => ({ index, site: sites[index] })).filter((c) => c.site)}
              x={chooser.x}
              y={chooser.y}
              bounds={rootSize}
              onPick={(i) => {
                setChooser(null);
                setDetailFocus(true);
                setSelectedKey(sites[i]?.key ?? null);
              }}
              onClose={() => {
                setChooser(null);
                restoreFocus();
              }}
              onZoomIn={() => {
                const c = chooser;
                setChooser(null);
                stage.current?.zoomAtPoint(c.x, c.y, 4);
                restoreFocus();
              }}
            />
          )}

          {hoverSite && finePointer && !chooser && hover && (
            <HoverTip site={hoverSite} x={hover.x} y={hover.y} text={hoverText} boundsWidth={rootSize.width} />
          )}

          {selected && (
            <div
              ref={sheetRef}
              className={
                side
                  ? `${styles.panel} absolute right-20 top-4 z-30 max-h-[calc(100%-2rem)] w-[min(21.25rem,calc(100%-7rem))] overflow-y-auto`
                  : `${styles.panel} ${styles.sheet} absolute inset-x-2 bottom-2 z-30`
              }
              style={side ? undefined : { maxHeight: Math.max(220, Math.round(rootSize.height * 0.5)), marginBottom: 'env(safe-area-inset-bottom)' }}
            >
              {!side && <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full" style={{ background: 'var(--nm-hairline)' }} />}
              <SiteDetail
                site={selected}
                view={view}
                clock={now}
                noaaOk={noaaOk}
                capturedAt={frame?.capturedAt ?? null}
                onClose={closeDetail}
                palette={palette}
                autoFocus={detailFocus}
                change={selectedChange}
              />
            </div>
          )}

          <p className="sr-only" role="status">
            {announce}
          </p>
        </>
      )}

      {stageEl}

      {fullscreen && (
        <>
          {wallText !== 'none' && (
            // The key stays up while the controls come and go. Wide screens:
            // one left column (legend, and in Story mode the featured event).
            // Narrow: a bottom strip, which yields to the tray sharing its
            // edge, and the story along the top.
            <div
              ref={legendRef}
              className={legendStrip ? undefined : styles.wallColumn}
              style={{ visibility: trayOpen && legendStrip ? 'hidden' : 'visible' }}
            >
              <WallLegend
                view={view}
                palette={palette}
                noaaOk={noaaOk}
                capturedAt={frame?.capturedAt ?? null}
                liveStatus={liveStatus}
                pulses={motion && dataLive && view !== 'flow'}
                journey={journeysOn}
                strip={legendStrip}
                changeWindow={changeCtx ? changeWindow : null}
                place={place?.name ?? null}
                rated={!!rated}
              />
              {wallText === 'story' && !legendStrip && view === 'flooding' && <TrendStrip points={floodTrend} palette={palette} wall />}
              {wallText === 'story' && !legendStrip && (
                <WallStory
                  story={story}
                  journey={storyJourney}
                  calm={calm}
                  view={view}
                  now={now}
                  palette={palette}
                  locator={locator}
                  regionStates={regionStates}
                  sequence={sequence}
                  rated={story?.site.siteId ? ratedBySite.get(story.site.siteId) ?? null : null}
                />
              )}
            </div>
          )}
          {wallText !== 'none' && (
            // The Eddy badge: legend and story displays only — Map only stays
            // free of words and logos. Above the legend strip on narrow screens.
            <WallBrand qr={appQr} bottom={legendStrip && legendHeight ? legendHeight + 24 : undefined} />
          )}
          {wallText === 'story' && legendStrip && (
            <div className={styles.wallStoryTop} style={{ visibility: trayOpen ? 'hidden' : 'visible' }}>
              <WallStory
                  story={story}
                  journey={storyJourney}
                  calm={calm}
                  view={view}
                  now={now}
                  palette={palette}
                  locator={locator}
                  regionStates={regionStates}
                  sequence={sequence}
                  rated={story?.site.siteId ? ratedBySite.get(story.site.siteId) ?? null : null}
                />
            </div>
          )}
          <div
            className="pointer-events-none absolute inset-x-0 z-40 flex justify-center px-3"
            style={{ bottom: 'max(1.5rem, calc(env(safe-area-inset-bottom) + 0.75rem))' }}
          >
            <FullscreenTray
              open={trayOpen}
              view={view}
              onView={(v) => {
                setPrefs({ view: v });
                armTray();
              }}
              wallText={wallText}
              onWallText={(t) => {
                setPrefs({ wallText: t });
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
              narrow={narrow}
              status={liveStatus}
              riverNames={prefs.riverNames}
              onRiverNames={
                place
                  ? (on) => {
                      setPrefs({ riverNames: on });
                      armTray();
                    }
                  : undefined
              }
              regionSelect={
                <RegionSelect
                  compact
                  place={place}
                  onPlace={(k) => {
                    setPlaceKey(k);
                    armTray();
                  }}
                />
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
