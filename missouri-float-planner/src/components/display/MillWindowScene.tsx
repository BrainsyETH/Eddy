'use client';

import { useEffect } from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import { millAsset, visibleMillPanels, type MillScene } from '@/lib/display/mill-scenes';
import type { RiverWindowSign } from '@/lib/display/river-window';
import styles from './river-window.module.css';

export type MillWindowSceneProps = {
  mills: MillScene[];
  signs: RiverWindowSign[];
  loading: boolean;
  onAssetError: () => void;
};

export default function MillWindowScene({ mills, signs, loading, onAssetError }: MillWindowSceneProps) {
  const frame = useCurrentFrame();
  const panels = visibleMillPanels(frame, mills.length);
  // Decode the panel after the incoming one before it is mounted. Do not
  // eagerly hold ten full-size decoded illustrations in a TV browser.
  const preloadId = mills.length ? mills[(panels[1].index + 1) % mills.length].id : null;
  useEffect(() => {
    if (!preloadId) return;
    const image = new window.Image();
    image.src = millAsset(preloadId);
    image.decode().catch(onAssetError);
  }, [preloadId, onAssetError]);

  return (
    <AbsoluteFill className={styles.millScene}>
      {!mills.length ? <div className={styles.fallback}>No mill scenes match these rivers.</div> : null}
      {panels.map(({ key, index, x }) => {
        const mill = mills[index];
        const sign = signs.find((s) => s.slug === mill.riverSlug);
        const [left, top, width, height, angle] = mill.board;
        return (
          <div key={key} className={styles.millPanel} data-mill={mill.id} style={{ transform: `translate3d(${x}px,0,0)` }}>
            <Img src={millAsset(mill.id)} className={styles.millArt} onError={onAssetError} />
            {mill.water ? (
              <div className={styles.millWater} style={{ clipPath: mill.water }} aria-hidden="true">
                <Img src={millAsset(mill.id)} className={styles.millArt} style={{ transform: `translateX(${Math.sin(frame * Math.PI / 60) * 1.5}px)` }} />
              </div>
            ) : null}
            <div className={styles.millSign} data-river={mill.riverSlug} style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`, transform: `rotate(${angle}deg)`, fontSize: `${16 * Math.min(1, height * 10.8 / 180)}px` }}>
              <div className={styles.millName}>{mill.name}</div>
              <div className={styles.millLocation}>{mill.location}</div>
              <div className={styles.millRiver}>{mill.context} · {mill.riverName}</div>
              {sign ? <>
                <div className={styles.millReading}>{sign.value}<small>{sign.unit}</small></div>
                <div className={styles.millCondition} data-warning={sign.code === 'high' || sign.code === 'dangerous'}>{sign.condition}</div>
                <div className={styles.millAge}>{sign.age}{sign.trend ? ` · ${sign.trend}` : ''}</div>
              </> : <div className={styles.millCondition}>{loading ? 'Checking the river…' : 'Reading unavailable'}</div>}
            </div>
          </div>
        );
      })}
      {/* Dense foreground trees cover the join between distinct real places.
          The join travels offscreen; artwork is never mirrored or crossfaded. */}
      {panels.map(({ key, x }) => (
        <Img key={key} src="/display/mills/transition.webp" className={styles.millTransition} onError={onAssetError}
          style={{ transform: `translate3d(${x - 70}px,${Math.sin(frame * Math.PI / 600) * 2}px,0)` }} aria-hidden="true" />
      ))}
    </AbsoluteFill>
  );
}
