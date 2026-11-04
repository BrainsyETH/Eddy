'use client';

import { useEffect } from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import {
  MILL_STAGE,
  MILL_SCENES,
  VERTICAL_DOCK_HEIGHT,
  millAsset,
  millCamera,
  millMoment,
  millRoute,
  mixHex,
  sceneProgress,
  verticalLayout,
  type MillFormat,
  type MillScene,
} from '@/lib/display/mill-scenes';
import { MILL_MAP_HEIGHT, MILL_MAP_RIVERS, MILL_MAP_WIDTH, STATE_LINE_LAT, projectMap, routeArc, tourViewBox } from '@/lib/display/mill-map';

// Always framed on all ten mills, so a filtered tour keeps its place in the Ozarks.
const TOUR_VIEW = tourViewBox(MILL_SCENES.map((m) => projectMap(...m.at)));
import type { RiverWindowSign } from '@/lib/display/river-window';
import styles from './river-window.module.css';

export type MillWindowSceneProps = {
  mills: MillScene[];
  signs: RiverWindowSign[];
  loading: boolean;
  format: MillFormat;
  /** Composition height: 1080 in landscape; 1920 or more in vertical. */
  height: number;
  onAssetError: () => void;
};

const NIGHT = '#0c1511';
const span = (frame: number, from: number, to: number) => Math.min(1, Math.max(0, (frame - from) / (to - from)));
const smooth = (t: number) => t * t * (3 - 2 * t);
/** Legs alternate the side they bow to (shared by the journey and the tour band). */
const legSide = (from: MillScene): 1 | -1 => (MILL_SCENES.findIndex((m) => m.id === from.id) % 2 ? 1 : -1);

export default function MillWindowScene({ mills, signs, loading, format, height, onAssetError }: MillWindowSceneProps) {
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
  const vertical = format === 'vertical';
  const layout = verticalLayout(vertical ? height : MILL_STAGE.vertical.height);
  const camera = millCamera(mill, moment.sceneFrame, format, layout.art);
  const next = mills.length > 1 ? mills[(moment.index + 1) % mills.length] : null;

  return (
    <AbsoluteFill className={styles.millScene} data-format={format}>
      <div className={styles.millWindow} style={vertical ? { height: layout.art } : undefined}>
        <MillPainting mill={mill} sign={sign} loading={loading} frame={frame} camera={camera} placard={vertical} onAssetError={onAssetError} />
        {vertical ? <div className={styles.millFade} style={{ background: `linear-gradient(to bottom, transparent, ${mill.tone})` }} aria-hidden="true" /> : null}
      </div>
      {vertical ? <MillDock mill={mill} sign={sign} loading={loading} next={next} top={layout.dockTop} /> : null}
      {vertical && layout.tour ? (
        <MillTour mills={mills} index={moment.index} progress={moment.interlude ? 1 : sceneProgress(moment.sceneFrame)} frame={frame} top={layout.tourTop} height={layout.tour} tone={mill.tone} />
      ) : null}
      {moment.interlude ? (
        <MillInterlude
          from={mills[moment.interlude.from]}
          to={mills[moment.interlude.to]}
          frame={moment.interlude.frame}
          veil={moment.veil}
          sign={signs.find((s) => s.slug === mills[moment.interlude!.to].riverSlug)}
          loading={loading}
          format={format}
          height={vertical ? layout.height : MILL_STAGE.landscape.height}
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

function MillDock({ mill, sign, loading, next, top }: { mill: MillScene; sign: RiverWindowSign | undefined; loading: boolean; next: MillScene | null; top: number }) {
  const route = next && next.id !== mill.id ? millRoute(mill, next) : null;
  return (
    <div
      className={styles.millDock}
      data-dock={mill.id}
      style={{ top, height: VERTICAL_DOCK_HEIGHT, background: `linear-gradient(to bottom, ${mill.tone}, ${mixHex(mill.tone, NIGHT, 0.6)})` }}
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

/** Below the dock on screens taller than 9:16: the whole tour on the map,
 * legs travelled, the leg under way filling in as the scene plays, and the
 * stops in order. It is the same map the journey between mills draws on. */
function MillTour({ mills, index, progress, frame, top, height, tone }: {
  mills: MillScene[];
  index: number;
  progress: number;
  frame: number;
  top: number;
  height: number;
  tone: string;
}) {
  const count = mills.length;
  const body = height - 64 - 64; // padding and header
  const k = body / TOUR_VIEW.height;
  const px = (v: number) => v / k; // screen pixels → map units
  const points = mills.map((m) => projectMap(...m.at));
  const next = count > 1 ? (index + 1) % count : null;
  const rowHeight = body / count;
  const list = count > 1 && rowHeight >= 40;
  const route = next !== null ? millRoute(mills[index], mills[next]) : null;
  const breathe = (Math.sin((frame * Math.PI) / 45) + 1) / 2;
  const [cx, cy] = points[index];
  return (
    <div className={styles.millTour} data-tour={mills[index].id} style={{ top, height, background: mixHex(tone, NIGHT, 0.78) }}>
      <div className={styles.tourHead}>
        <span>The mill tour</span>
        <span>Stop {index + 1} of {count}</span>
      </div>
      <div className={styles.tourBody} style={{ height: body }}>
        <svg className={styles.tourMap} style={{ height: body, aspectRatio: `${TOUR_VIEW.width} / ${TOUR_VIEW.height}` }} viewBox={`${TOUR_VIEW.x} ${TOUR_VIEW.y} ${TOUR_VIEW.width} ${TOUR_VIEW.height}`} aria-hidden="true">
          {Object.values(MILL_MAP_RIVERS).map((line, i) => (
            <polyline key={i} points={line} className={styles.mapRiver} style={{ strokeWidth: px(1.5) }} />
          ))}
          {count > 1 ? mills.map((m, i) => {
            const arc = routeArc(points[i], points[(i + 1) % count], legSide(m));
            const done = i < index;
            const current = i === index;
            return (
              <g key={m.id}>
                <path d={arc.d} className={styles.tourLeg} data-state={done ? 'done' : 'ahead'} style={{ strokeWidth: px(done ? 2 : 1.5), strokeDasharray: done ? undefined : `${px(4)} ${px(5)}` }} />
                {current ? <path d={arc.d} pathLength={1} className={styles.tourLegNow} style={{ strokeWidth: px(3), strokeDasharray: 1, strokeDashoffset: 1 - progress }} /> : null}
              </g>
            );
          }) : null}
          {points.map(([x, y], i) => (
            <circle key={mills[i].id} cx={x} cy={y} r={px(i === index ? 0 : 4)} className={styles.mapMill} style={{ fillOpacity: i < index ? 0.75 : 0.45 }} />
          ))}
          {next !== null ? <circle cx={points[next][0]} cy={points[next][1]} r={px(7)} className={styles.tourNext} style={{ strokeWidth: px(2) }} /> : null}
          <circle cx={cx} cy={cy} r={px(10 + breathe * 6)} className={styles.mapPulse} style={{ strokeWidth: px(2), opacity: 0.25 + (1 - breathe) * 0.45 }} />
          <circle cx={cx} cy={cy} r={px(8)} className={styles.mapTo} style={{ strokeWidth: px(2.5) }} />
        </svg>
        {list ? (
          <ol className={styles.tourList} style={{ fontSize: Math.min(28, rowHeight * 0.52) }}>
            {mills.map((m, i) => (
              <li key={m.id} style={{ height: Math.min(rowHeight, 64) }} data-state={i === index ? 'now' : i === next ? 'next' : i < index ? 'done' : 'ahead'} aria-current={i === index ? 'step' : undefined}>
                <b>{i + 1}</b>
                <span>{m.name}</span>
                {i === index ? <em>Now</em> : i === next ? <em>Next</em> : null}
              </li>
            ))}
          </ol>
        ) : (
          <div className={styles.tourSummary}>
            <div><em>Now</em>{mills[index].name}</div>
            {next !== null && route ? <div><em>Next</em>{mills[next].name} · {route.miles} mi {route.direction}</div> : null}
          </div>
        )}
      </div>
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
function MillInterlude({ from, to, frame, veil, sign, loading, format, height }: {
  from: MillScene;
  to: MillScene;
  frame: number;
  veil: number;
  sign: RiverWindowSign | undefined;
  loading: boolean;
  format: MillFormat;
  height: number;
}) {
  const same = from.id === to.id;
  const route = same ? null : millRoute(from, to);
  const a = projectMap(...from.at);
  const b = projectMap(...to.at);
  const arc = routeArc(a, b, legSide(from));
  const shown = smooth(span(frame, 24, 48)) * (1 - smooth(span(frame, 178, 200)));
  const draw = smooth(span(frame, 44, 130));
  const head = arc.at(draw);
  const arrived = span(frame, 120, 150);
  const tint = mixHex(mixHex(from.tone, to.tone, span(frame, 30, 150)), NIGHT, 0.45);
  const [, stateY] = projectMap(STATE_LINE_LAT, 0);
  const { width } = MILL_STAGE[format];
  // A stretched vertical stage keeps the card centred in the extra height.
  const lift = Math.max(0, (height - MILL_STAGE[format].height) / 2);
  const box = { ...MAP_BOX[format], top: MAP_BOX[format].top + lift };
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
        <div className={styles.interludeText} style={format === 'vertical' ? { top: 1210 + lift } : undefined}>
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
