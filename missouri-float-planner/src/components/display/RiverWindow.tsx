'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Player, type PlayerRef } from '@remotion/player';
import {
  REFRESH_INTERVAL,
  SCENE_STRIDE,
  WINDOW_FPS,
  WINDOW_FRAMES,
  WINDOW_HEIGHT,
  WINDOW_WIDTH,
  parseRiverSelection,
  parseRiverSnapshot,
  selectWindowRivers,
  toWindowSign,
} from '@/lib/display/river-window';
import RiverWindowScene from './RiverWindowScene';
import MillWindowScene from './MillWindowScene';
import { MILL_PASS_FRAMES, MILL_RIVERS, millDuration, selectMillScenes } from '@/lib/display/mill-scenes';
import styles from './river-window.module.css';

export default function RiverWindow() {
  const params = useSearchParams();
  const rawRivers = params.get('rivers');
  const millMode = params.get('theme') !== 'river';
  const requested = useMemo(() => parseRiverSelection(rawRivers), [rawRivers]);
  const mills = useMemo(() => selectMillScenes(requested), [requested]);
  const duration = millMode ? millDuration(mills.length) : WINDOW_FRAMES;
  const stride = millMode ? MILL_PASS_FRAMES : SCENE_STRIDE;
  const player = useRef<PlayerRef>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(true);
  const [showReadings, setShowReadings] = useState(false);
  const [showMills, setShowMills] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [fullscreenError, setFullscreenError] = useState(false);
  const [assetError, setAssetError] = useState(false);
  const onAssetError = useCallback(() => setAssetError(true), []);

  const query = useQuery({
    queryKey: ['river-window-snapshot'],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/rivers', {
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('River conditions unavailable');
      return { rivers: parseRiverSnapshot(await response.json()), fetchedAt: Date.now() };
    },
    staleTime: REFRESH_INTERVAL,
    refetchInterval: REFRESH_INTERVAL,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const signs = useMemo(
    () =>
      query.data
        ? selectWindowRivers(query.data.rivers, requested.length ? requested : millMode ? MILL_RIVERS : []).map((r) =>
            toWindowSign(r, query.data.fetchedAt, now)
          )
        : [],
    [query.data, requested, now, millMode]
  );
  const sceneProps = useMemo(() => ({ signs, loading: query.isPending }), [signs, query.isPending]);
  const millProps = useMemo(() => ({ ...sceneProps, mills, onAssetError }), [sceneProps, mills, onAssetError]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    const refreshClock = () => {
      if (!document.hidden) setNow(Date.now());
    };
    document.addEventListener('visibilitychange', refreshClock);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshClock);
    };
  }, []);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPaused(motion.matches || params.get('motion') === 'off');
    const change = () => {
      if (motion.matches) setPaused(true);
    };
    motion.addEventListener('change', change);
    return () => motion.removeEventListener('change', change);
  }, [params]);

  useEffect(() => {
    const sync = () => {
      if (paused || showReadings || showMills || document.hidden) player.current?.pause();
      else player.current?.play();
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [paused, showReadings, showMills]);

  const warning = signs.filter((s) => s.code === 'dangerous' || s.code === 'high');
  const connection = query.isError
    ? query.data
      ? 'Connection interrupted · showing last received readings'
      : 'Readings unavailable · retrying automatically'
    : query.isPending
      ? 'Checking river conditions…'
      : !signs.length
        ? requested.length
          ? 'No matching rivers in this selection'
          : 'No river readings available'
        : null;

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.current?.requestFullscreen();
      setFullscreenError(false);
    } catch {
      setFullscreenError(true);
    }
  }

  return (
    <div className={styles.viewport}>
      <div ref={stage} className={styles.stage} data-theme={millMode ? 'mills' : 'river'} aria-label="Eddy River Window">
        {millMode ? (
        <Player
          ref={player}
          component={MillWindowScene}
          inputProps={millProps}
          compositionWidth={WINDOW_WIDTH}
          compositionHeight={WINDOW_HEIGHT}
          durationInFrames={duration}
          fps={WINDOW_FPS}
          loop
          style={{ width: '100%', height: '100%' }}
          controls={false}
          clickToPlay={false}
          doubleClickToFullscreen={false}
          spaceKeyToPlayOrPause={false}
          numberOfSharedAudioTags={0}
          errorFallback={() => (
            <div className={styles.fallback}>
              The river scene could not load. Open Readings to see the river report.
            </div>
          )}
        />
        ) : (
        <Player
          ref={player}
          component={RiverWindowScene}
          inputProps={sceneProps}
          compositionWidth={WINDOW_WIDTH}
          compositionHeight={WINDOW_HEIGHT}
          durationInFrames={WINDOW_FRAMES}
          fps={WINDOW_FPS}
          loop
          style={{ width: '100%', height: '100%' }}
          controls={false}
          clickToPlay={false}
          doubleClickToFullscreen={false}
          spaceKeyToPlayOrPause={false}
          numberOfSharedAudioTags={0}
          errorFallback={() => (
            <div className={styles.fallback}>
              The river scene could not load. Open Readings to see the river report.
            </div>
          )}
        />
        )}
        <header className={styles.brand}>
          <b>eddy</b>
          <span>{(params.get('name') || (millMode ? 'MISSOURI MILLS' : 'RIVER WINDOW')).slice(0, 50)}</span>
        </header>
        <div className={styles.status} role="status">
          <time dateTime={new Date(now).toISOString()}>
            {new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </time>
          {connection ? <p>{connection}</p> : null}
          {fullscreenError ? <p>Full screen is unavailable in this browser.</p> : null}
          {assetError ? <p>Scenery unavailable. River readings remain available.</p> : null}
        </div>
        {warning.length ? (
          <div className={styles.warning} role="status">
            {warning.map((s) => `${s.name}: ${s.condition}`).join(' · ')} · Check the river report
            before launching.
          </div>
        ) : null}
        {showMills ? (
          <section className={`${styles.reader} ${styles.millPicker}`} aria-label="Choose a mill">
            <h2>Missouri mills</h2>
            {mills.length ? mills.map((mill, index) => (
              <button key={mill.id} onClick={() => { player.current?.seekTo(index * MILL_PASS_FRAMES); setShowMills(false); }}>
                <strong>{mill.name}</strong><span>{mill.location}</span>
              </button>
            )) : <p>No mill scenes match these rivers.</p>}
          </section>
        ) : null}
        {showReadings ? (
          <section className={styles.reader} aria-label="Current river readings">
            <h2>River readings</h2>
            {signs.length ? (
              <table>
                <thead>
                  <tr>
                    <th>River</th>
                    <th>Reading</th>
                    <th>Condition</th>
                    <th>Age</th>
                  </tr>
                </thead>
                <tbody>
                  {signs.map((sign) => (
                    <tr key={sign.slug}>
                      <th scope="row">{sign.name}</th>
                      <td>
                        {sign.value} {sign.unit}
                      </td>
                      <td>{sign.condition}</td>
                      <td>{sign.age}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>{connection ?? 'No readings available.'}</p>
            )}
            <p>Illustrated places, not current water levels. Readings describe the named river, not the millpond or spring. River ratings and units come from Eddy’s river report.</p>
          </section>
        ) : null}
        <nav
          className={styles.controls}
          data-paused={paused || showReadings || showMills}
          aria-label="Display controls"
        >
          <button onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
            {paused ? 'Play' : 'Pause'}
          </button>
          <button
            onClick={() => {
              const frame = player.current?.getCurrentFrame() ?? 0;
              player.current?.seekTo(
                (Math.floor(frame / stride) * stride + stride) % duration
              );
            }}
          >
            {millMode ? 'Next mill' : 'Next river'}
          </button>
          {millMode ? <button onClick={() => { setShowMills((p) => !p); setShowReadings(false); }} aria-expanded={showMills}>{showMills ? 'Close mills' : 'Mills'}</button> : null}
          <button onClick={() => { setShowReadings((p) => !p); setShowMills(false); }} aria-expanded={showReadings}>
            {showReadings ? 'Close readings' : 'Readings'}
          </button>
          <button onClick={fullscreen}>Full screen</button>
        </nav>
        {!millMode ? <AssetHealth onError={onAssetError} /> : null}
      </div>
      <p className={styles.portraitNote}>Turn your screen sideways for the river window.</p>
    </div>
  );
}

function AssetHealth({ onError }: { onError: () => void }) {
  const errorRef = useRef(onError);
  errorRef.current = onError;
  useEffect(() => {
    const assets = ['panorama.webp', 'foreground.webp'].map((file) => {
      const image = new window.Image();
      image.onerror = () => errorRef.current();
      image.src = `/display/river-window/${file}`;
      return image;
    });
    return () =>
      assets.forEach((image) => {
        image.onerror = null;
      });
  }, []);
  return null;
}
