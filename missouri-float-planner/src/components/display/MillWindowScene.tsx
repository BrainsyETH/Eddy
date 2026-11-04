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
  riverLabel,
  sceneProgress,
  verticalLayout,
  type MillFormat,
  type MillScene,
} from '@/lib/display/mill-scenes';
import { MILL_MAP_HEIGHT, MILL_MAP_RIVERS, MILL_MAP_WIDTH, STATE_LINE_LAT, projectMap, routeArc, tourViewBox } from '@/lib/display/mill-map';
import type { RiverWindowSign } from '@/lib/display/river-window';
import { conditionChip } from '@shared/condition-system';
import styles from './river-window.module.css';

// Always framed on all ten mills, so a filtered tour keeps its place in the Ozarks.
const TOUR_VIEW = tourViewBox(MILL_SCENES.map((m) => projectMap(...m.at)));

export type MillWindowSceneProps = {
  mills: MillScene[];
  signs: RiverWindowSign[];
  loading: boolean;
  format: MillFormat;
  /** Composition height: 1080 in landscape; 1920 or more in vertical. */
  height: number;
  onAssetError: () => void;
};

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
        <MillPainting mill={mill} frame={frame} camera={camera} onAssetError={onAssetError} />
      </div>
      {vertical ? (
        <MillDock mill={mill} sign={sign} loading={loading} next={next} top={layout.dockTop} />
      ) : (
        <MillCard mill={mill} sign={sign} loading={loading} sceneFrame={moment.sceneFrame} />
      )}
      {vertical && layout.tour ? (
        <MillTour mills={mills} index={moment.index} progress={moment.interlude ? 1 : sceneProgress(moment.sceneFrame)} frame={frame} top={layout.tourTop} height={layout.tour} />
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

/** The painting alone. Its painted board stays blank: no text is ever laid on
 * the artwork. Information lives in the card (landscape) or dock (vertical). */
function MillPainting({ mill, frame, camera, onAssetError }: {
  mill: MillScene;
  frame: number;
  camera: ReturnType<typeof millCamera>;
  onAssetError: () => void;
}) {
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
    </div>
  );
}

function BuiltBadge({ mill }: { mill: MillScene }) {
  return mill.built ? <span className={styles.builtBadge}>{mill.built}</span> : null;
}

/** Landscape: a card in the lower left, outside the painting. It has room for
 * one fact: the first for half the scene, then the second, with a brief dip
 * between so the text never jumps. */
function MillCard({ mill, sign, loading, sceneFrame }: { mill: MillScene; sign: RiverWindowSign | undefined; loading: boolean; sceneFrame: number }) {
  const p = sceneProgress(sceneFrame);
  const fact = mill.facts[p < 0.5 ? 0 : 1];
  const factOpacity = Math.min(1, Math.abs(p - 0.5) * 40);
  return (
    <div className={styles.millCard} data-card={mill.id} data-river={mill.riverSlug}>
      <BuiltBadge mill={mill} />
      <div className={styles.cardName}>{mill.name}</div>
      <div className={styles.cardLocation}>{mill.location}</div>
      <p className={styles.cardFact} style={{ opacity: factOpacity }}>{fact}</p>
      <RiverNote mill={mill} sign={sign} loading={loading} variant="card" />
    </div>
  );
}

/** The river, condition first: the reading is a footnote, not the headline.
 * "On" or "Nearby" says whether the mill stands on the reported river; the
 * chip uses the shared condition colours, so a high river reads as it does in
 * the app. Stale or missing readings say so instead of a condition. */
function RiverNote({ mill, sign, loading, variant }: { mill: MillScene; sign: RiverWindowSign | undefined; loading: boolean; variant: 'card' | 'dock' | 'journey' }) {
  const chip = conditionChip(sign?.code ?? 'unknown');
  const flow = sign && sign.value !== '—' ? `${sign.value}${sign.unit ? ` ${sign.unit}` : ''}${sign.trend ? `, ${sign.trend.toLowerCase()}` : ''}` : null;
  const detail = sign ? [flow, sign.age].filter(Boolean).join(' · ') : null;
  return (
    <div className={styles.riverNote} data-variant={variant}>
      <span className={styles.riverNoteLabel}>{riverLabel(mill)}</span>
      <span className={styles.riverNoteLine}>
        {/* The shared tint is translucent: layer it over a sand base so the
            chip keeps its app contrast on the dark teal panels. */}
        <b style={{ backgroundImage: `linear-gradient(${chip.background}, ${chip.background})`, color: chip.color, borderColor: chip.borderColor }}>
          {sign ? sign.condition : loading ? 'Checking the river…' : 'Reading unavailable'}
        </b>
        {detail ? <small>{detail}</small> : null}
      </span>
    </div>
  );
}

function MillDock({ mill, sign, loading, next, top }: { mill: MillScene; sign: RiverWindowSign | undefined; loading: boolean; next: MillScene | null; top: number }) {
  const route = next && next.id !== mill.id ? millRoute(mill, next) : null;
  return (
    <div className={styles.millDock} data-dock={mill.id} data-river={mill.riverSlug} style={{ top, height: VERTICAL_DOCK_HEIGHT }}>
      <BuiltBadge mill={mill} />
      <div className={styles.dockName}>{mill.name}</div>
      <div className={styles.dockLocation}>{mill.location}</div>
      <div className={styles.dockFacts}>
        {mill.facts.map((f) => <p key={f}>{f}</p>)}
      </div>
      <RiverNote mill={mill} sign={sign} loading={loading} variant="dock" />
      {next && route ? <div className={styles.dockNext}>Next stop: {next.name}, {route.miles} miles {route.direction}</div> : null}
    </div>
  );
}

/** Below the dock on screens taller than 9:16: the whole tour on the map,
 * legs travelled, the leg under way filling in as the scene plays, and the
 * stops in order with the year each was built. It is the same map the journey
 * between mills draws on. */
function MillTour({ mills, index, progress, frame, top, height }: {
  mills: MillScene[];
  index: number;
  progress: number;
  frame: number;
  top: number;
  height: number;
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
  const year = (m: MillScene) => m.built?.match(/\d{4}/)?.[0];
  return (
    <div className={styles.millTour} data-tour={mills[index].id} style={{ top, height }}>
      <div className={styles.tourHead}>
        <span>Mill tour</span>
        <span>Stop {index + 1} of {count}</span>
      </div>
      <div className={styles.tourBody} style={{ height: body }}>
        <svg className={styles.tourMap} style={{ height: body, aspectRatio: `${TOUR_VIEW.width} / ${TOUR_VIEW.height}` }} viewBox={`${TOUR_VIEW.x} ${TOUR_VIEW.y} ${TOUR_VIEW.width} ${TOUR_VIEW.height}`} aria-hidden="true">
          {Object.values(MILL_MAP_RIVERS).map((line, i) => (
            <polyline key={i} points={line} className={styles.mapRiver} style={{ strokeWidth: px(2) }} />
          ))}
          {count > 1 ? mills.map((m, i) => {
            const arc = routeArc(points[i], points[(i + 1) % count], legSide(m));
            const done = i < index;
            return (
              <g key={m.id}>
                <path d={arc.d} className={styles.tourLeg} data-state={done ? 'done' : 'ahead'} style={{ strokeWidth: px(done ? 2.5 : 2), strokeDasharray: done ? undefined : `${px(5)} ${px(6)}` }} />
                {i === index ? <path d={arc.d} pathLength={1} className={styles.mapRoute} style={{ strokeWidth: px(4), strokeDasharray: 1, strokeDashoffset: 1 - progress }} /> : null}
              </g>
            );
          }) : null}
          {points.map(([x, y], i) => (i === index ? null : (
            <circle key={mills[i].id} cx={x} cy={y} r={px(5)} className={styles.mapMill} style={{ strokeWidth: px(2) }} />
          )))}
          {next !== null ? <circle cx={points[next][0]} cy={points[next][1]} r={px(9)} className={styles.tourNext} style={{ strokeWidth: px(3) }} /> : null}
          <circle cx={cx} cy={cy} r={px(12 + breathe * 7)} className={styles.mapPulse} style={{ strokeWidth: px(3), opacity: 0.3 + (1 - breathe) * 0.5 }} />
          <circle cx={cx} cy={cy} r={px(10)} className={styles.mapTo} style={{ strokeWidth: px(3) }} />
        </svg>
        {list ? (
          <ol className={styles.tourList} style={{ fontSize: Math.min(28, rowHeight * 0.52) }}>
            {mills.map((m, i) => (
              <li key={m.id} style={{ height: Math.min(rowHeight, 64) }} data-state={i === index ? 'now' : i === next ? 'next' : i < index ? 'done' : 'ahead'} aria-current={i === index ? 'step' : undefined}>
                <b>{i + 1}</b>
                <span>{m.name}{year(m) ? <i> · {year(m)}</i> : null}</span>
                {i === index ? <em>Now</em> : i === next ? <em>Next</em> : null}
              </li>
            ))}
          </ol>
        ) : (
          <div className={styles.tourSummary}>
            <div><em>Now</em>{mills[index].name}</div>
            {next !== null && route ? <div><em>Next</em>{mills[next].name}, {route.miles} miles {route.direction}</div> : null}
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

/** Between two mills the painting gives way to a light trail map, and the route from one to the next is drawn over the rivers that tie the
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
    <div className={styles.interlude} data-format={format} data-interlude={`${from.id}-${to.id}`} style={{ width, height, opacity: veil, clipPath: clip }}>
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
          <div className={styles.interludeKicker}>{same ? 'Back to' : 'Next stop'}</div>
          <div className={styles.interludeName}>{to.name}</div>
          <div className={styles.interludeLocation}>{to.location}</div>
          {to.built ? <span className={styles.builtBadge} style={{ marginTop: 18 }}>{to.built}</span> : null}
          {route ? <div className={styles.interludeRoute}>{route.miles} miles {route.direction} of {from.name}</div> : null}
          <RiverNote mill={to} sign={sign} loading={loading} variant="journey" />
        </div>
      </div>
    </div>
  );
}
