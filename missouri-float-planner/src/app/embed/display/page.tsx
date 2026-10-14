'use client';

// src/app/embed/display/page.tsx
// The wall display: an always-on river screen for a guest house, outfitter or
// campground lobby TV. Open it full-screen on the TV's browser (or a stick) and
// leave it; it refreshes itself.
//
//   /embed/display?lat=37.15&lng=-91.35&name=Riverside%20Guest%20House
//   /embed/display?rivers=current,jacks-fork,eleven-point
//   /embed/display?e=emb_xxxxxxxx      (a registered embed's logo and name)
//
// Every decision about WHAT to show lives in src/lib/display/display-model.ts
// (pure, tested). This file fetches, schedules and draws.
//
// ── Built for a screen nobody touches ───────────────────────────────────────
//   * The stage is a fixed 1920×1080 (or 1080×1920 when the screen is taller
//     than wide) scaled to fit, so it reads the same on a 1366×768 hotel TV and
//     a 4K panel.
//   * Data refreshes every 5 minutes; the page reloads itself every 6 hours so
//     a long-running screen picks up deploys.
//   * When a refresh fails the last good data stays up, the header says so,
//     and readings keep their ages: a frozen screen must never pass for a live
//     one.
//   * Nothing static for hours: the Reads rotate, the river flows, and the
//     whole layout drifts a few pixels over ten minutes against burn-in.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { conditionDef } from '@shared/condition-system';
import { READING_LAG_NOTE } from '@shared/floatable-headline';
import { getEddyImageForCondition, EDDY_IMAGES } from '@/constants';
import { useEmbedBranding } from '@/components/embed/useEmbedBranding';
import type { EddyUpdatesResponse, RiverAlertsResponse, RiversResponse } from '@/types/api';
import {
  buildDisplayModel,
  displayAgeLabel,
  parseCoords,
  type DisplayFavoriteFloat,
  type DisplayModel,
} from '@/lib/display/display-model';
import Ambient from './Ambient';
import RiverLine from './RiverLine';
import styles from './display.module.css';

const REFRESH_MS = 5 * 60 * 1000;
const RELOAD_MS = 6 * 60 * 60 * 1000;
const READ_ROTATE_MS = 12 * 1000;
const NOTICE_ROTATE_MS = 9 * 1000;

interface Snapshot {
  rivers: RiversResponse['rivers'];
  updates: EddyUpdatesResponse | null;
  alerts: RiverAlertsResponse['alerts'];
  floats: DisplayFavoriteFloat[];
  at: number;
}

interface ForecastDay { dayOfWeek: string; tempHigh: number; precipitation: number }

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

function Pill({ code }: { code: string }) {
  const def = conditionDef(code);
  return (
    <span className={styles.pill} style={{ color: def.solid, borderColor: def.solid, background: def.bg }}>
      <i style={{ background: def.solid }} />
      {def.label}
    </span>
  );
}

function useScale() {
  const [view, setView] = useState({ portrait: false, scale: 1 });
  useEffect(() => {
    const fit = () => {
      const w = window.innerWidth, h = window.innerHeight;
      const portrait = h > w;
      const scale = portrait ? Math.min(w / 1080, h / 1920) : Math.min(w / 1920, h / 1080);
      setView({ portrait, scale });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return view;
}

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export default function DisplayPage() {
  const params = useSearchParams();
  const coords = useMemo(() => parseCoords(params.get('lat'), params.get('lng')), [params]);
  const pinned = useMemo(() => (params.get('rivers') || '').split(',').map((s) => s.trim()).filter(Boolean), [params]);
  const hostName = (params.get('name') || '').slice(0, 60);
  const { branding } = useEmbedBranding();
  const { portrait, scale } = useScale();
  const now = useClock();

  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const [forecast, setForecast] = useState<ForecastDay[] | null>(null);

  const load = useCallback(async () => {
    const [rivers, updates, alerts, floats] = await Promise.all([
      getJson<RiversResponse>('/api/rivers'),
      getJson<EddyUpdatesResponse>('/api/eddy-updates'),
      getJson<RiverAlertsResponse>('/api/river-alerts'),
      getJson<{ floats: DisplayFavoriteFloat[] }>('/api/favorite-floats?v=2'),
    ]);
    if (!rivers?.rivers?.length) { setFailedAt(Date.now()); return; }
    setFailedAt(null);
    setSnap({ rivers: rivers.rivers, updates, alerts: alerts?.alerts ?? [], floats: floats?.floats ?? [], at: Date.now() });
  }, []);

  useEffect(() => {
    load();
    const refresh = window.setInterval(load, REFRESH_MS);
    const reload = window.setTimeout(() => window.location.reload(), RELOAD_MS);
    return () => { window.clearInterval(refresh); window.clearTimeout(reload); };
  }, [load]);

  const model: DisplayModel | null = useMemo(() => (snap ? buildDisplayModel({
    rivers: snap.rivers,
    updates: snap.updates?.updates,
    statewide: snap.updates?.statewide,
    alerts: snap.alerts,
    floats: snap.floats,
    coords,
    pinned,
  }) : null), [snap, coords, pinned]);

  // Weather for the property, or for the suggested river when no location was given.
  const weatherAt = useMemo(() => {
    if (coords) return coords;
    const slug = model?.best?.river.slug ?? model?.rivers[0]?.slug;
    const r = snap?.rivers.find((x) => x.slug === slug);
    const p = r?.floatAccessCoordinates?.[0];
    return p ? { lat: p.lat, lng: p.lng } : null;
  }, [coords, model, snap]);
  const weatherKey = weatherAt ? `${weatherAt.lat.toFixed(2)},${weatherAt.lng.toFixed(2)}` : '';
  useEffect(() => {
    if (!weatherKey) return;
    const [lat, lng] = weatherKey.split(',');
    let cancelled = false;
    const get = () => getJson<{ days?: ForecastDay[] }>(`/api/weather/forecast?lat=${lat}&lon=${lng}`)
      .then((d) => { if (!cancelled && d?.days?.length) setForecast(d.days.slice(0, 3)); });
    get();
    const id = window.setInterval(get, 60 * 60 * 1000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [weatherKey]);

  // Rotations.
  const [readIdx, setReadIdx] = useState(0);
  const [noticeIdx, setNoticeIdx] = useState(0);
  useEffect(() => {
    const a = window.setInterval(() => setReadIdx((i) => i + 1), READ_ROTATE_MS);
    const b = window.setInterval(() => setNoticeIdx((i) => i + 1), NOTICE_ROTATE_MS);
    return () => { window.clearInterval(a); window.clearInterval(b); };
  }, []);

  const host = branding?.businessName || hostName;
  const logo = branding?.logoUrl || EDDY_IMAGES.favicon;
  const clock = now ? now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  const lastGood = snap ? new Date(snap.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;

  const stageClass = `${styles.stage} ${portrait ? styles.port : styles.land}`;
  const read = model?.reads.length ? model.reads[readIdx % model.reads.length] : null;
  const notice = model?.notices.length ? model.notices[noticeIdx % model.notices.length] : null;
  const best = model?.best ?? null;

  return (
    <div className={styles.viewport}>
      <div className={stageClass} style={{ transform: `scale(${scale})` }}>
        <Ambient />
        {!model ? (
          <div className={styles.loading}>{failedAt ? 'River conditions are unavailable right now. Retrying…' : 'Checking the rivers…'}</div>
        ) : (
          <div className={styles.layer}>
            <header className={styles.head}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.logo} src={logo} alt="" />
              <span className={styles.brand}>Eddy</span>
              <span className={styles.host}>{host ? `Rivers near ${host}` : 'Ozarks river conditions'}</span>
              <div className={styles.clock}>
                <b>{clock}</b>
                {failedAt ? (
                  <span className={styles.offline}>Connection lost · showing data from {lastGood}</span>
                ) : (
                  <span>Readings updated {displayAgeLabel(model.freshestAgeHours)}</span>
                )}
              </div>
            </header>

            <section className={`${styles.panel} ${styles.best}`}>
              <div className={styles.kicker}>{coords ? 'Best float near here' : 'Best float today'}</div>
              {best ? (
                <>
                  <div>
                    <h2 className={styles.bestName}>{best.river.name}</h2>
                    <div className={styles.route}>
                      {best.trip ? `${best.trip.putInName} → ${best.trip.takeOutName}` : 'Fresh, floatable reading'}
                      {best.river.distanceMiles != null ? (best.river.distanceMiles < 1 ? ' · nearby' : ` · ≈ ${Math.round(best.river.distanceMiles)} mi away`) : ''}
                    </div>
                  </div>
                  <RiverLine slug={best.river.slug} putInId={best.trip?.putInId ?? null} takeOutId={best.trip?.takeOutId ?? null} />
                  <div className={styles.facts}>
                    <div className={styles.fact}><b><Pill code={best.river.code} /></b><span>{best.river.reading ?? 'Right now'}</span></div>
                    <div className={styles.fact}>
                      {best.trip?.duration ? <><b>{best.trip.duration}</b><span>Typical trip</span></>
                        : <><span className={styles.note}>{best.trip?.withheld ?? 'Pick a stretch on eddy.guide'}</span><span>Float time</span></>}
                    </div>
                    <div className={styles.fact}>
                      <b>{best.trip?.distanceMiles != null ? `${best.trip.distanceMiles.toFixed(1)} mi` : '—'}</b><span>Distance</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className={styles.empty}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={EDDY_IMAGES.flag} alt="" />
                  {model.emptyBest}
                </div>
              )}
            </section>

            <section className={`${styles.panel} ${styles.pulse}`}>
              <div className={styles.kicker}>Ozarks Pulse</div>
              <div>
                <div className={styles.big}>{model.floatable}<small> of {model.total}</small></div>
                <div className={styles.pulseSub}>rivers are floatable right now</div>
                <div className={styles.mix}>
                  {model.mix.map((m) => <span key={m.code} style={{ flex: m.count, background: conditionDef(m.code).solid }} />)}
                </div>
              </div>
              {read ? (
                <div className={styles.read} key={`${read.slug}-${readIdx}`}>
                  <div className={styles.readWho}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={getEddyImageForCondition(read.code)} alt="" />
                    <div><div className={styles.kicker} style={{ fontSize: 18, color: '#e2eee8' }}>Eddy&apos;s Read</div><h3>{read.name}</h3></div>
                    {read.code !== 'unknown' ? <span style={{ marginLeft: 'auto' }}><Pill code={read.code} /></span> : null}
                  </div>
                  <p className={styles.readText}>{read.text}</p>
                  <div className={styles.readMeta}>Re-checked against the live gauge</div>
                  <div className={styles.dots}>{model.reads.map((r, i) => <i key={r.slug} className={i === readIdx % model.reads.length ? styles.on : undefined} />)}</div>
                </div>
              ) : null}
            </section>

            <section className={`${styles.panel} ${styles.list}`}>
              <div className={styles.kicker}>{coords ? 'Rivers nearby' : 'Rivers'}</div>
              {model.rivers.slice(0, portrait ? 3 : 5).map((r) => (
                <div key={r.slug} className={`${styles.row} ${r.stale ? styles.stale : ''}`}>
                  <span style={{ background: conditionDef(r.code).solid }} />
                  <div className={styles.rowBody}>
                    <div className={styles.rowTop}><b>{r.name}</b><Pill code={r.code} /></div>
                    <div className={styles.rowMeta}>
                      {[r.reading, r.trend && r.trend !== 'steady' ? (r.trend === 'rising' ? 'rising' : 'falling') : null, displayAgeLabel(r.ageHours)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
              ))}
            </section>

            <footer className={styles.foot}>
              <div className={styles.panel}>
                <div className={styles.kicker} style={{ fontSize: 18 }}>Weather</div>
                {forecast ? (
                  <div className={styles.wx}>
                    {forecast.map((d, i) => (
                      <div key={d.dayOfWeek + i}><b>{Math.round(d.tempHigh)}°</b><span>{i === 0 ? 'Today' : d.dayOfWeek.slice(0, 3)}{d.precipitation >= 40 ? ` · ${d.precipitation}% rain` : ''}</span></div>
                    ))}
                  </div>
                ) : <span style={{ fontSize: 22, color: '#72B5C4' }}>Forecast unavailable</span>}
              </div>
              {notice ? (
                <div key={`${notice.key}-${noticeIdx}`} className={`${styles.panel} ${styles.notice} ${notice.tone === 'danger' ? styles.danger : ''}`}>
                  <b>⚠ {notice.title}</b>
                  <span>{notice.detail}</span>
                </div>
              ) : (
                <div className={`${styles.panel} ${styles.calm}`}>
                  <b>Check the gauge the morning you go</b>
                  <span>{READING_LAG_NOTE}</span>
                </div>
              )}
              <div className={`${styles.panel} ${styles.qr}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/app-store/eddy-guide-qr.svg" alt="" />
                <div><b>Plan your float</b><span>Scan for eddy.guide/app</span></div>
              </div>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
