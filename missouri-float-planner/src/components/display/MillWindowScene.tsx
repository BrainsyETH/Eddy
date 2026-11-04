'use client';

import { useEffect } from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import {
  MILL_STAGE,
  MILL_SCENES,
  VERTICAL_ART_HEIGHT,
  millAsset,
  millCamera,
  millMoment,
  millRoute,
  mixHex,
  type MillFormat,
  type MillScene,
} from '@/lib/display/mill-scenes';
import { MILL_MAP_HEIGHT, MILL_MAP_RIVERS, MILL_MAP_WIDTH, STATE_LINE_LAT, projectMap, routeArc } from '@/lib/display/mill-map';
import type { RiverWindowSign } from '@/lib/display/river-window';
import styles from './river-window.module.css';

export type MillWindowSceneProps = {
  mills: MillScene[];
  signs: RiverWindowSign[];
  loading: boolean;
  format: MillFormat;
  onAssetError: () => void;
};

const NIGHT = '#0c1511';
const span = (frame: number, from: number, to: number) => Math.min(1, Math.max(0, (frame - from) / (to - from)));
const smooth = (t: number) => t * t * (3 - 2 * t);

export default function MillWindowScene({ mills, signs, loading, format, onAssetError }: MillWindowSceneProps) {
  const frame = useCurrentFrame();
  const moment = millMoment(frame, mills.length);
  // Decode the next painting while this one plays. Only one full-size
  // illustration is ever mounted; do not hold ten decoded images in a TV browser.
  const preloadId = moment ? mills[(moment.index + 1) % mills.length].id : null;
  useEffect(() => {
    if (!preloadId) return;
    const image = new window.Image();
    image.src = millAsset(preloadId);
    image.decode().catch(onAssetError);
  }, [preloadId, onAssetError]);

  if (!moment) {
    return (
      <AbsoluteFill className={styles.millScene}>
        <div className={styles.fallback}>No mill scenes match these rivers.</div>
      </AbsoluteFill>
    );
  }
  const mill = mills[moment.index];
  const sign = signs.find((s) => s.slug === mill.riverSlug);
  const camera = millCamera(mill, moment.sceneFrame, format);
  const vertical = format === 'vertical';
  const next = mills.length > 1 ? mills[(moment.index + 1) % mills.length] : null;

  return (
    <AbsoluteFill className={styles.millScene} data-format={format}>
      <div className={styles.millWindow} style={vertical ? { height: VERTICAL_ART_HEIGHT } : undefined}>
        <MillPainting mill={mill} sign={sign} loading={loading} frame={frame} camera={camera} placard={vertical} onAssetError={onAssetError} />
        {vertical ? <div className={styles.millFade} style={{ background: `linear-gradient(to bottom, transparent, ${mill.tone})` }} aria-hidden="true" /> : null}
      </div>
      {vertical ? <MillDock mill={mill} sign={sign} loading={loading} next={next} /> : null}
      {moment.interlude ? (
        <MillInterlude
          from={mills[moment.interlude.from]}
          to={mills[moment.interlude.to]}
          frame={moment.interlude.frame}
          veil={moment.veil}
          sign={signs.find((s) => s.slug === mills[moment.interlude!.to].riverSlug)}
          loading={loading}
          format={format}
        />
      ) : null}
    </AbsoluteFill>
  );
}

function MillPainting({ mill, sign, loading, frame, camera, placard, onAssetError }: {
  mill: MillScene;
  sign: RiverWindowSign | undefined;
  loading: boolean;
  frame: number;
  camera: ReturnType<typeof millCamera>;
  placard: boolean;
  onAssetError: () => void;
}) {
  const [left, top, width, height, angle] = mill.board;
  return (
    <div
      className={styles.millPanel}
      data-mill={mill.id}
      style={{ transform: `translate3d(${camera.x}px,0,0) scale(${camera.scale})`, transformOrigin: camera.origin }}
    >
      <Img src={millAsset(mill.id)} className={styles.millArt} onError={onAssetError} />
      {mill.water ? (
        <div className={styles.millWater} style={{ clipPath: mill.water }} aria-hidden="true">
          <Img src={millAsset(mill.id)} className={styles.millArt} style={{ transform: `translateX(${Math.sin((frame * Math.PI) / 60) * 1.5}px)` }} />
        </div>
      ) : null}
      {/* The painted board carries the full reading in landscape. In the
          vertical format the dock carries it, and the board is a name placard. */}
      <div
        className={styles.millSign}
        data-river={mill.riverSlug}
        data-placard={placard || undefined}
        style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`, transform: `rotate(${angle}deg)`, fontSize: `${16 * Math.min(1, (height * 10.8) / 180)}px` }}
      >
        <div className={styles.millName}>{mill.name}</div>
        <div className={styles.millLocation}>{mill.location}</div>
        {placard ? null : (
          <>
            <div className={styles.millRiver}>{mill.context} · {mill.riverName}</div>
            {sign ? (
              <>
                <div className={styles.millReading}>{sign.value}<small>{sign.unit}</small></div>
                <div className={styles.millCondition} data-warning={sign.code === 'high' || sign.code === 'dangerous'}>{sign.condition}</div>
                <div className={styles.millAge}>{sign.age}{sign.trend ? ` · ${sign.trend}` : ''}</div>
              </>
            ) : (
              <div className={styles.millCondition}>{loading ? 'Checking the river…' : 'Reading unavailable'}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MillDock({ mill, sign, loading, next }: { mill: MillScene; sign: RiverWindowSign | undefined; loading: boolean; next: MillScene | null }) {
  const route = next && next.id !== mill.id ? millRoute(mill, next) : null;
  return (
    <div
      className={styles.millDock}
      data-dock={mill.id}
      style={{ top: VERTICAL_ART_HEIGHT, background: `linear-gradient(to bottom, ${mill.tone}, ${mixHex(mill.tone, NIGHT, 0.6)})` }}
    >
      <div className={styles.dockKicker}>{mill.context} · {mill.riverName}</div>
      <div className={styles.dockName}>{mill.name}</div>
      <div className={styles.dockLocation}>{mill.location}</div>
      <div className={styles.dockRule} aria-hidden="true" />
      {sign ? (
        <>
          <div className={styles.dockReading}>{sign.value}<small>{sign.unit}</small></div>
          <div className={styles.dockCondition} data-warning={sign.code === 'high' || sign.code === 'dangerous'}>{sign.condition}</div>
          <div className={styles.dockAge}>{sign.age}{sign.trend ? ` · ${sign.trend}` : ''}</div>
        </>
      ) : (
        <div className={styles.dockCondition}>{loading ? 'Checking the river…' : 'Reading unavailable'}</div>
      )}
      {next && route ? <div className={styles.dockNext}>Next · {next.name} · {route.miles} mi {route.direction}</div> : null}
    </div>
  );
}

// Where the route map sits in each composition, so the iris can open from the
// destination dot's exact pixel. Text takes the remaining column or band.
const MAP_BOX: Record<MillFormat, { left: number; top: number; height: number }> = {
  landscape: { left: 170, top: 110, height: 860 },
  vertical: { left: 112, top: 150, height: 1030 },
};

/** Between two mills the painting dims into a veil tinted from both scenes,
 * and the route from one to the next is drawn over the rivers that tie the
 * collection together. Then the next mill opens out of its own dot on the map,
 * an iris that grows until the place fills the screen. Each join is its own:
 * a different leg, river, reading and opening point, never a repeated prop. */
function MillInterlude({ from, to, frame, veil, sign, loading, format }: {
  from: MillScene;
  to: MillScene;
  frame: number;
  veil: number;
  sign: RiverWindowSign | undefined;
  loading: boolean;
  format: MillFormat;
}) {
  const same = from.id === to.id;
  const route = same ? null : millRoute(from, to);
  const a = projectMap(...from.at);
  const b = projectMap(...to.at);
  const side = MILL_SCENES.findIndex((m) => m.id === from.id) % 2 ? 1 : -1;
  const arc = routeArc(a, b, side);
  const shown = smooth(span(frame, 24, 48)) * (1 - smooth(span(frame, 178, 200)));
  const draw = smooth(span(frame, 44, 130));
  const head = arc.at(draw);
  const arrived = span(frame, 120, 150);
  const tint = mixHex(mixHex(from.tone, to.tone, span(frame, 30, 150)), NIGHT, 0.45);
  const [, stateY] = projectMap(STATE_LINE_LAT, 0);
  const { width, height } = MILL_STAGE[format];
  const box = MAP_BOX[format];
  const k = box.height / MILL_MAP_HEIGHT;
  const cx = box.left + b[0] * k;
  const cy = box.top + b[1] * k;
  // The iris opens only once the next painting is mounted underneath (after the swap).
  const iris = smooth(span(frame, 150, 204)) * Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy));
  const clip = iris > 0.5
    ? `path(evenodd, "M0 0H${width}V${height}H0Z M${cx - iris} ${cy} a${iris} ${iris} 0 1 0 ${2 * iris} 0 a${iris} ${iris} 0 1 0 ${-2 * iris} 0Z")`
    : undefined;
  const highlighted = new Set([from.riverSlug, to.riverSlug]);
  // Labels sit on the side away from the other end of the leg (short legs such
  // as Greer → Turner would otherwise collide), unless that runs off the map.
  const label = (p: [number, number], name: string, strong: boolean) => {
    const other = p === a ? b : a;
    const room = name.length * (strong ? 17 : 15) + 30;
    let right = same ? p[0] < MILL_MAP_WIDTH / 2 : p[0] >= other[0];
    if (right && p[0] + room > MILL_MAP_WIDTH) right = false;
    if (!right && p[0] - room < 0) right = true;
    // And above/below away from it, so two labels on the same side still part.
    const dy = same ? 10 : p[1] <= other[1] ? -14 : 34;
    return (
      <text x={p[0] + (right ? 22 : -22)} y={p[1] + dy} textAnchor={right ? 'start' : 'end'} className={strong ? styles.mapLabelStrong : styles.mapLabel}>
        {name}
      </text>
    );
  };

  return (
    <div className={styles.interlude} data-format={format} data-interlude={`${from.id}-${to.id}`} style={{ width, height, opacity: veil, clipPath: clip, background: `radial-gradient(ellipse at 40% 45%, ${mixHex(tint, '#f4ead5', 0.06)}, ${tint} 70%)` }}>
      <div className={styles.interludeBody} style={{ opacity: shown, transform: `translateY(${(1 - shown) * 14}px)` }}>
        <svg className={styles.interludeMap} style={{ left: box.left, top: box.top, height: box.height }} viewBox={`0 0 ${MILL_MAP_WIDTH} ${MILL_MAP_HEIGHT}`} aria-hidden="true">
          <line x1={0} x2={MILL_MAP_WIDTH} y1={stateY} y2={stateY} className={styles.mapState} />
          <text x={8} y={stateY - 14} className={styles.mapStateLabel}>MISSOURI</text>
          <text x={8} y={stateY + 34} className={styles.mapStateLabel}>ARKANSAS</text>
          {Object.entries(MILL_MAP_RIVERS).map(([slug, points]) => (
            <polyline key={slug} points={points} className={highlighted.has(slug) ? styles.mapRiverLit : styles.mapRiver} />
          ))}
          {MILL_SCENES.map((m) => {
            const [x, y] = projectMap(...m.at);
            return <circle key={m.id} cx={x} cy={y} r={7} className={styles.mapMill} />;
          })}
          {same ? null : (
            <>
              <path d={arc.d} pathLength={1} className={styles.mapRoute} style={{ strokeDasharray: 1, strokeDashoffset: 1 - draw }} />
              <circle cx={head[0]} cy={head[1]} r={9} className={styles.mapHead} style={{ opacity: 1 - arrived }} />
              <circle cx={a[0]} cy={a[1]} r={11} className={styles.mapFrom} />
              {label(a, from.name, false)}
            </>
          )}
          <circle cx={b[0]} cy={b[1]} r={14 + arrived * 16} className={styles.mapPulse} style={{ opacity: (1 - arrived) * 0.8 * (arrived > 0 ? 1 : 0) }} />
          <circle cx={b[0]} cy={b[1]} r={13} className={styles.mapTo} style={{ opacity: same ? 1 : 0.35 + arrived * 0.65 }} />
          {label(b, to.name, true)}
        </svg>
        <div className={styles.interludeText}>
          <div className={styles.interludeKicker}>{same ? 'Once more at' : 'Next mill'}</div>
          <div className={styles.interludeName}>{to.name}</div>
          <div className={styles.interludeLocation}>{to.location}</div>
          {route ? <div className={styles.interludeRoute}>{route.miles} mi {route.direction} of {from.name}</div> : null}
          <div className={styles.interludeReading} data-warning={sign ? sign.code === 'high' || sign.code === 'dangerous' : undefined}>
            <span>{to.context} · {to.riverName}</span>
            <b>{sign ? `${sign.value}${sign.unit ? ` ${sign.unit}` : ''} · ${sign.condition}` : loading ? 'Checking the river…' : 'Reading unavailable'}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
