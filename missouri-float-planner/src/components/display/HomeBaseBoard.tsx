'use client';

// The home-base river board: a self-running portrait wall display for a
// lodging partner (docs/home-base-board.md). It draws; src/lib/display/
// home-base.ts decides. Readings come from the same endpoints as the rest of
// Eddy, refreshed on a timer, and the last good snapshot stays up (marked)
// when a refresh fails — exactly the River Window's rules.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { useQueries, useQuery } from '@tanstack/react-query';
import { conditionDef, conditionOtterMood } from '@shared/condition-system';
import { EDDY_IMAGES } from '@/constants';
import { weatherGlyph } from '@/components/ui/weather-glyph';
import { parseRiverSnapshot, REFRESH_INTERVAL } from '@/lib/display/river-window';
import { MILL_SCENES, millAsset } from '@/lib/display/mill-scenes';
import {
  RAIN_EMPHASIS,
  advanceLoop,
  artRegion,
  boardLayout,
  growFrame,
  parseForecast,
  boardRows,
  clockLabel,
  eddyTakeFor,
  formatReading,
  homeBaseFor,
  isNight,
  linePath,
  loopDelay,
  parseGaugeHistory,
  project,
  relativeLevel,
  SERIES_POINTS,
  seriesTime,
  sevenDaySeries,
  spotlightOrder,
  stepLabel,
  sunTimes,
  type BoardRow,
  type LoopState,
} from '@/lib/display/home-base';
import styles from './home-base-board.module.css';

const ART_WIDTH = 1080;
const ART_HEIGHT = Math.round((1080 * 940) / 1672); // dillard.webp is 1672 x 940
const ART_OFFSET = 60; // the painting is drawn 60px above the top edge
const TAKE_REFRESH = 15 * 60_000;
const FORECAST_REFRESH = 60 * 60_000;
/** The key sits below the divide on the 586px design map. */
const KEY_TOP = 352;
const HISTORY_REFRESH = 30 * 60_000;
const WATER = '#2D7889'; // replay ink: flow only, never a condition colour
const EDDY_MARK = EDDY_IMAGES.favicon;

type Qr = { href: string; src: string };

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]), cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

function Badge({ row, long }: { row: Pick<BoardRow, 'code'>; long?: boolean }) {
  const c = conditionDef(row.code);
  return (
    <span className={styles.badge} style={{ background: c.bg, color: c.ink, borderColor: c.chipBorder }}>
      <i style={{ background: c.solid }} />
      {long ? c.longLabel : c.label}
    </span>
  );
}

function Spark({ values, cursor }: { values: (number | null)[]; cursor: number | null }) {
  const w = 216, h = 48;
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return <svg width={w} height={h} aria-hidden="true" />;
  const min = Math.min(...nums), max = Math.max(...nums), span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * (w - 8) + 4;
  const y = (v: number) => h - 5 - ((v - min) / span) * (h - 12);
  // Gaps break the line instead of being bridged.
  let d = '';
  values.forEach((v, i) => {
    if (v == null) return;
    d += `${i && values[i - 1] != null ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
  });
  const at = cursor ?? values.length - 1;
  const end = values[at] ?? null;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <line x1={4} x2={w - 4} y1={h - 1} y2={h - 1} stroke="#DBD5CA" />
      <path d={d} fill="none" stroke="#256574" strokeWidth={2.5} strokeLinejoin="round" />
      {end != null && <circle cx={x(at)} cy={y(end)} r={5} fill="#256574" stroke="#fff" strokeWidth={2} />}
    </svg>
  );
}

export default function HomeBaseBoard({ boardId, riverQrs, appQr }: { boardId: string; riverQrs: Record<string, Qr>; appQr: Qr }) {
  const config = homeBaseFor(boardId)!;
  const mill = MILL_SCENES.find((s) => s.id === config.millScene)!;
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  // 0 until mounted, so the server render and the first client render agree.
  const [now, setNow] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [loop, setLoop] = useState<LoopState>({ phase: 'spot', index: 0 });
  const [hidden, setHidden] = useState(false);

  // ── Data ──
  const rivers = useQuery({
    queryKey: ['home-base-rivers'],
    queryFn: async ({ signal }) => ({ rivers: parseRiverSnapshot(await getJson('/api/rivers', signal)), fetchedAt: Date.now() }),
    staleTime: REFRESH_INTERVAL,
    refetchInterval: REFRESH_INTERVAL,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const take = useQuery({
    queryKey: ['home-base-take', config.doorstep],
    queryFn: ({ signal }) => getJson(`/api/eddy-update/${config.doorstep}`, signal),
    staleTime: TAKE_REFRESH,
    refetchInterval: TAKE_REFRESH,
    retry: 1,
  });
  const sites = useMemo(
    () => [...new Set((rivers.data?.rivers ?? []).filter((r) => config.rivers.some((c) => c.slug === r.slug)).map((r) => r.primaryGaugeSiteId).filter((s): s is string => !!s))].sort(),
    [rivers.data, config.rivers]
  );
  const forecastQuery = useQuery({
    queryKey: ['home-base-forecast', config.doorstep],
    queryFn: ({ signal }) => getJson(`/api/weather/${config.doorstep}/forecast`, signal),
    staleTime: FORECAST_REFRESH,
    refetchInterval: FORECAST_REFRESH,
    retry: 1,
  });
  const histories = useQueries({
    queries: sites.map((site) => ({
      queryKey: ['home-base-history', site],
      queryFn: async ({ signal }: { signal: AbortSignal }) => parseGaugeHistory(await getJson(`/api/gauges/${site}/history?days=7`, signal)),
      staleTime: HISTORY_REFRESH,
      refetchInterval: HISTORY_REFRESH,
      retry: 1,
    })),
  });

  const rows = useMemo(
    () => (rivers.data ? boardRows(config, rivers.data.rivers, rivers.data.fetchedAt, now) : []),
    [config, rivers.data, now]
  );
  const door = rows.find((r) => r.slug === config.doorstep) ?? null;
  const doorRiver = rivers.data?.rivers.find((r) => r.slug === config.doorstep);
  const eddyTake = door && !door.stale ? eddyTakeFor(take.data, doorRiver) : null;
  // The sign carries the rated reading; the facts line adds the other unit.
  const dc = doorRiver?.currentCondition;
  const otherReading = !door || door.stale || !dc ? null
    : door.unit === 'cfs' ? (dc.gaugeHeightFt != null ? `${dc.gaugeHeightFt.toFixed(2)} ft` : null)
    : dc.dischargeCfs != null ? `${formatReading(dc.dischargeCfs, 'cfs')} cfs` : null;

  // One shared clock for every series: the newest reading across the gauges.
  // Small enough (six rivers × 57 points) to recompute each render.
  const historyData = histories.map((h) => h.data);
  const latest = historyData.flatMap((d) => (d?.length ? [d[d.length - 1].t] : []));
  const seriesEnd = latest.length ? Math.max(...latest) : null;
  const series = new Map<string, (number | null)[]>();
  if (seriesEnd != null) {
    for (const row of rows) {
      const i = row.siteId ? sites.indexOf(row.siteId) : -1;
      const data = i >= 0 ? historyData[i] : undefined;
      if (data && row.unit) series.set(row.slug, sevenDaySeries(data, row.unit, seriesEnd));
    }
  }

  // ── Loop ──
  const order = useMemo(() => spotlightOrder(config).filter((slug) => rows.some((r) => r.slug === slug)), [config, rows]);
  const steps = series.size ? SERIES_POINTS : 0;
  const motionOff = useRef(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    motionOff.current = new URLSearchParams(window.location.search).get('motion') === 'off';
    const sync = () => setReduceMotion(media.matches || motionOff.current);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    if (hidden || !order.length || motionOff.current) return;
    const t = window.setTimeout(() => setLoop((s) => advanceLoop(s, order.length, steps, reduceMotion)), loopDelay(loop, reduceMotion));
    return () => window.clearTimeout(t);
  }, [loop, hidden, order.length, steps, reduceMotion]);
  const replay = loop.phase === 'replay' && steps ? loop.index : null;
  const spotlight = loop.phase === 'spot' ? order[loop.index % Math.max(order.length, 1)] : config.doorstep;

  // ── Clock, visibility, scale ──
  useEffect(() => {
    setNow(Date.now());
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    const vis = () => {
      setHidden(document.hidden);
      if (!document.hidden) setNow(Date.now());
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
  useEffect(() => {
    const fit = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // ── Layout: on a screen taller than 9:16 the board grows to fill it ──
  const forecast = now ? parseForecast(forecastQuery.data, now) : { place: null, days: [] };
  const layout = boardLayout(viewport.w, viewport.h, config, forecast.days.length > 0);
  const frame = useMemo(() => growFrame(config.map, layout.mapGrow), [config.map, layout.mapGrow]);
  const paths = useMemo(() => Object.fromEntries(Object.entries(config.lines).map(([slug, line]) => [slug, linePath(frame, line)])), [config, frame]);
  const home = project(frame, config.home.lng, config.home.lat);
  const sun = now ? sunTimes(new Date(now + (config.home.lng / 15) * 3_600_000), config.home.lat, config.home.lng) : null;
  const night = now ? isNight(now, config.home.lat, config.home.lng) : false;

  const status = rivers.isError
    ? rivers.data
      ? 'Connection interrupted · showing the last readings received'
      : 'Readings unavailable · retrying automatically'
    : rivers.isPending
      ? 'Checking river conditions…'
      : null;

  const spotRow = rows.find((r) => r.slug === spotlight) ?? null;
  const valueAt = (row: BoardRow) => (replay == null ? row.value : formatReading(series.get(row.slug)?.[replay] ?? null, row.unit));
  const sign = mill.board;
  const signStyle: CSSProperties = {
    left: (sign[0] / 100) * ART_WIDTH,
    top: (sign[1] / 100) * ART_HEIGHT - ART_OFFSET,
    width: (sign[2] / 100) * ART_WIDTH,
    height: (sign[3] / 100) * ART_HEIGHT,
  };
  const halo = { paintOrder: 'stroke', stroke: '#F4EFE7', strokeWidth: 6, strokeLinejoin: 'round' } as const;
  const doorQr = riverQrs[config.doorstep];
  const art = { width: ART_WIDTH, height: ART_HEIGHT, offsetY: ART_OFFSET };
  const water = useMemo(
    () => (['pool', 'falls'] as const).flatMap((kind) => (config.water[kind] ? [{ kind, ...artRegion(config.water[kind]!, art) }] : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- art is a constant
    [config]
  );
  const spotQr = (replay == null && spotRow ? riverQrs[spotRow.slug] : null) ?? doorQr;

  return (
    <div className={styles.viewport}>
      <div
        className={`${styles.board} ${reduceMotion ? '' : styles.drift} ${night ? styles.night : ''}`}
        style={{
          height: layout.height,
          gridTemplateRows: layout.forecast ? '622px auto auto auto 132px' : '622px auto 1fr 132px',
          transform: `translate(${layout.x}px, ${layout.y}px) scale(${layout.scale})`,
          visibility: layout.scale ? 'visible' : 'hidden',
        }}
      >
        <section className={styles.hero} style={{ backgroundImage: `url(${millAsset(mill.id)})` }} aria-label={`${mill.name} on ${mill.riverName}`}>
          {/* Moving water: only inside the water polygons, so the rocks, mill
              and sign stay still. An animated SVG displacement ripples the
              painting itself; tiled glints (pool) and foam (falls) travel
              with the current. Skipped entirely with reduced motion. */}
          {!reduceMotion && (
            <>
              <svg className={styles.filters} width="0" height="0" aria-hidden="true">
                <filter id="home-base-pool" x="-5%" y="-20%" width="110%" height="140%" colorInterpolationFilters="sRGB">
                  <feTurbulence type="fractalNoise" baseFrequency="0.008 0.07" numOctaves={2} seed={4} result="ripple">
                    <animate attributeName="baseFrequency" dur="14s" values="0.008 0.07;0.011 0.088;0.008 0.07" repeatCount="indefinite" />
                  </feTurbulence>
                  <feDisplacementMap in="SourceGraphic" in2="ripple" scale={8} xChannelSelector="R" yChannelSelector="G" />
                </filter>
                <filter id="home-base-falls" x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
                  <feTurbulence type="fractalNoise" baseFrequency="0.07 0.012" numOctaves={2} seed={9} result="rush">
                    <animate attributeName="baseFrequency" dur="2.4s" values="0.07 0.012;0.07 0.022;0.07 0.012" repeatCount="indefinite" />
                  </feTurbulence>
                  <feDisplacementMap in="SourceGraphic" in2="rush" scale={7} xChannelSelector="R" yChannelSelector="G" />
                </filter>
              </svg>
              {water.map((w) => (
                <div
                  key={w.kind}
                  className={styles.water}
                  aria-hidden="true"
                  style={{
                    left: w.left,
                    top: w.top,
                    width: w.width,
                    height: w.height,
                    clipPath: w.clipPath,
                    filter: `url(#home-base-${w.kind})`,
                    backgroundImage: `url(${millAsset(mill.id)})`,
                    backgroundPosition: `${-w.left}px ${-ART_OFFSET - w.top}px`,
                  }}
                >
                  <i className={w.kind === 'pool' ? styles.glints : styles.foam} />
                </div>
              ))}
            </>
          )}
          <div className={`${styles.plaque} ${styles.logo}`}>
            <Image src={config.logo.src} alt={config.logo.alt} width={config.logo.width} height={config.logo.height} />
          </div>
          <div className={`${styles.plaque} ${styles.title}`}>
            <strong>Rivers near the cabin</strong>
            <span>{door ? `Huzzah reading ${door.age}` : 'Eddy river conditions'}</span>
          </div>
          {door && (
            <div className={styles.sign} style={signStyle} aria-hidden="true">
              <small>{door.name.split(' ')[0]}</small>
              <b className={styles.mono}>{door.value}</b>
              <small>{door.unit}</small>
            </div>
          )}
          <div className={styles.door}>
            <div className={styles.doorText}>
              <span className={styles.eyebrow}>At the door</span>
              <h1 className={styles.doorName}>{door?.name ?? mill.riverName}</h1>
              {door ? (
                <div className={styles.facts}>
                  <Badge row={door} long />
                  {door.trend && <span>{door.trend}</span>}
                  {otherReading && <span className={styles.mono}>{otherReading}</span>}
                </div>
              ) : (
                <div className={styles.facts}>{status ?? 'Reading unavailable'}</div>
              )}
              <span className={styles.gauge}>{config.rivers.find((r) => r.slug === config.doorstep)?.tip}</span>
            </div>
            <div />
            {eddyTake && (
              <div className={styles.take}>
                <span>Eddy&apos;s take</span>
                <q>{eddyTake}</q>
              </div>
            )}
            <Image
              className={styles.otter}
              src={EDDY_IMAGES[conditionOtterMood(door?.code ?? 'unknown')]}
              alt="Eddy the otter"
              width={224}
              height={207}
            />
          </div>
        </section>

        <section className={styles.card}>
          <div
            className={styles.map}
            style={{
              height: frame.height,
              backgroundImage: `url(/display/${config.id}/relief.jpg)`,
              // The relief is baked reliefPad taller at each end; show the middle.
              backgroundPosition: `0 ${-(config.reliefPad - layout.mapGrow / 2)}px`,
            }}
          >
            <svg viewBox={`0 0 ${frame.width} ${frame.height}`} role="img" aria-label={`Map of the rivers around ${config.name}`}>
              {[10, 20, 30, 40].map((mi) => (
                <circle key={mi} cx={home[0]} cy={home[1]} r={(mi / 69) * frame.scale} fill="none" stroke="#6B6459" strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="4 7" />
              ))}
              <path d={linePath(frame, config.divide)} fill="none" stroke="#524D43" strokeWidth={2} strokeDasharray="12 8" />
              {(() => {
                const y = project(frame, ...config.divide[config.divide.length - 1])[1];
                const x = frame.width - 28;
                return (
                  <g textAnchor="end" fontWeight={700} letterSpacing={1.5} fontSize={14} fill="#524D43" style={{ textTransform: 'uppercase', fontFamily: 'var(--font-body)' }}>
                    <text x={x} y={y - 16} {...halo}>{config.divideLabels.north}</text>
                    <text x={x} y={y + 28} {...halo}>{config.divideLabels.south}</text>
                  </g>
                );
              })()}
              {rows.map((row) => {
                const d = paths[row.slug];
                if (!d) return null;
                const s = series.get(row.slug) ?? [];
                const on = replay == null && row.slug === spotlight;
                const w = replay == null ? (on ? 8 : 5.5) : 3.5 + 9 * relativeLevel(s, s[replay] ?? null);
                const color = replay == null ? conditionDef(row.code).solid : WATER;
                return (
                  <g key={row.slug} opacity={replay == null && !on ? 0.6 : 1}>
                    <path d={d} fill="none" stroke={on ? '#0F2D35' : '#FFFFFF'} strokeWidth={w + (on ? 6 : 4)} strokeLinecap="round" strokeLinejoin="round" />
                    <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
                    <path className={styles.flow} d={d} fill="none" stroke="#FFFFFF" strokeOpacity={0.9} strokeWidth={Math.max(2, w / 3)} strokeDasharray="2 30" strokeLinecap="round" />
                  </g>
                );
              })}
              {rows.map((row) => {
                const label = config.labels[row.slug];
                if (!label) return null;
                const [x, y] = project(frame, label[0], label[1]);
                const on = replay == null && row.slug === spotlight;
                return (
                  <text key={row.slug} x={x} y={y} textAnchor={label[2]} fill="#0F2D35" fontSize={on ? 25 : 21} fontWeight={600} style={{ fontFamily: 'var(--font-display)' }} {...halo}>
                    {row.name}
                  </text>
                );
              })}
              {Object.entries(config.gauges).map(([site, gauge]) => {
                const row = rows.find((r) => r.siteId === site);
                if (!row) return null;
                const [x, y] = project(frame, gauge.at[0], gauge.at[1]);
                const text = `${valueAt(row)} ${row.unit}`.trim();
                const tw = text.length * 9.6 + 18;
                const left = gauge.side === 'left' ? x - 12 - tw : x + 12;
                return (
                  <g key={site}>
                    <circle cx={x} cy={y} r={6.5} fill="#FFFFFF" stroke="#1D525F" strokeWidth={3} />
                    <rect x={left} y={y - 15} width={tw} height={28} rx={6} fill="#FFFFFF" stroke="#1D525F" strokeWidth={2} />
                    <text x={left + 9} y={y + 5} fill="#2D2A24" fontSize={15} style={{ fontFamily: 'var(--font-mono)' }}>{text}</text>
                  </g>
                );
              })}
              <g>
                <line x1={home[0]} y1={home[1]} x2={home[0]} y2={home[1] + 30} stroke="#2F4A34" strokeWidth={2.5} />
                <rect x={home[0] - 42} y={home[1] + 34} width={170} height={58} rx={8} fill="#A49C8E" />
                <rect x={home[0] - 46} y={home[1] + 30} width={170} height={58} rx={8} fill="#F8F6F1" stroke="#2F4A34" strokeWidth={2.5} />
                <image href={config.logo.src} x={home[0] - 32} y={home[1] + 34} width={143} height={50} aria-label={config.name} />
                <circle cx={home[0]} cy={home[1]} r={9} fill="#2F4A34" stroke="#F8F6F1" strokeWidth={3} />
              </g>
            </svg>
            <div className={styles.mapTitle}>The rivers around the cabin</div>
            <div className={styles.key} style={{ top: KEY_TOP + layout.mapGrow / 2 }}>
              <span><i style={{ background: conditionDef('good').solid }} />Good</span>
              <span><i style={{ background: conditionDef('low').solid }} />Low</span>
              <span><i style={{ background: 'repeating-linear-gradient(90deg,#524D43 0 8px,transparent 8px 13px)', height: 3 }} />Divide (approx.)</span>
              <span>Rings every 10 mi</span>
            </div>
          </div>
          <div className={styles.spot}>
            {replay != null && seriesEnd != null ? (
              <>
                <div className={styles.spotName}><b>Replaying the past 7 days</b></div>
                <div className={`${styles.spotDrive} ${styles.mono}`}>{stepLabel(seriesTime(seriesEnd, replay))}</div>
                <div className={styles.bar}><i style={{ width: `${Math.round((replay / (SERIES_POINTS - 1)) * 100)}%` }} /></div>
              </>
            ) : spotRow ? (
              <>
                <div className={styles.spotName}><b>{spotRow.name}</b><Badge row={spotRow} long /></div>
                <div className={`${styles.spotDrive} ${styles.mono}`}>~{spotRow.driveMinutes}<small>min drive</small></div>
                <p>{spotRow.sharesGaugeWith ? `Rated from the ${spotRow.sharesGaugeWith} gauge. ` : ''}{spotRow.tip}</p>
                <div className={styles.scan}>Scan to open in Eddy →</div>
              </>
            ) : (
              <div className={styles.spotName}><b>{status ?? 'No river readings available'}</b></div>
            )}
            {spotQr && (
              <span className={styles.spotQr}>
                <Image src={spotQr.src} alt={`QR code: ${spotQr.href}`} width={68} height={68} unoptimized />
              </span>
            )}
          </div>
        </section>

        <section className={`${styles.card} ${styles.list}`} aria-label="Rivers farther afield">
          <div className={styles.listHead}><span>Farther afield</span><span>Past 7 days</span><span>Flow</span><span>Drive</span></div>
          {rows
            .filter((r) => r.slug !== config.doorstep)
            .sort((a, b) => a.driveMinutes - b.driveMinutes)
            .map((row) => (
              <button
                key={row.slug}
                type="button"
                className={styles.row}
                aria-pressed={replay == null && row.slug === spotlight}
                onClick={() => setLoop({ phase: 'spot', index: Math.max(0, order.indexOf(row.slug)) })}
              >
                <span className={styles.rowName}>
                  {row.name.replace(/ River$/, '')}
                  {replay == null ? (
                    <>
                      <Badge row={row} />
                      {row.trend && <small>{row.trend.toLowerCase()}</small>}
                    </>
                  ) : (
                    seriesEnd != null && <small>at {stepLabel(seriesTime(seriesEnd, replay))}</small>
                  )}
                </span>
                <Spark values={series.get(row.slug) ?? []} cursor={replay} />
                <span className={`${styles.rowValue} ${styles.mono}`}>{valueAt(row)}<small>{row.unit}</small></span>
                <span className={`${styles.rowValue} ${styles.mono}`}>~{row.driveMinutes}<small>min</small></span>
              </button>
            ))}
        </section>

        {layout.forecast && (
          <section className={`${styles.card} ${styles.forecast}`} aria-label="Weather forecast">
            <div className={styles.forecastLabel}>
              <span className={styles.eyebrow}>Forecast</span>
              <b>{forecast.place ? `Near ${forecast.place}` : 'Near the cabin'}</b>
              <span>Rain chance in coral when 40% or more</span>
            </div>
            {forecast.days.map((d) => {
              const Glyph = weatherGlyph(d.icon);
              return (
                <div key={d.date} className={styles.forecastDay}>
                  <span>{d.day}</span>
                  <Glyph size={32} strokeWidth={1.75} aria-hidden="true" />
                  <b className={styles.mono}>{d.high}°{d.low !== d.high && <small>/{d.low}°</small>}</b>
                  <span className={d.rain >= RAIN_EMPHASIS ? styles.rainy : undefined}>Rain {d.rain}%</span>
                </div>
              );
            })}
          </section>
        )}

        <footer className={styles.foot}>
          <div className={styles.sun}>
            {sun && <span>Sunrise <b>{clockLabel(sun.sunrise)}</b> · Sunset <b>{clockLabel(sun.sunset)}</b></span>}
            <span>Readings refresh every 5 minutes · Flow from USGS</span>
          </div>
          <div className={styles.credit}>
            <span className={styles.wordmark}>
              <Image src={EDDY_MARK} alt="" width={34} height={34} />
              Conditions by <b>Eddy</b>
            </span>
            <span>Scan to get the Eddy app →</span>
          </div>
          <span className={styles.qr}>
            <Image src={appQr.src} alt={`QR code: ${appQr.href}`} width={70} height={70} unoptimized />
          </span>
        </footer>

        {status && rows.length > 0 && <div className={styles.status} role="status">{status}</div>}
      </div>
    </div>
  );
}
