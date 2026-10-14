'use client';

import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import {
  SCENE_STRIDE,
  WINDOW_FRAMES,
  scenePosition,
  type RiverWindowSign,
} from '@/lib/display/river-window';
import styles from './river-window.module.css';

export type RiverWindowSceneProps = { signs: RiverWindowSign[]; loading: boolean };

/** Frame-driven composition: the web player and a render use the same scene.
 * Live text is aligned to the painted kiosk interior in panorama.webp;
 * neither its measurements nor its condition labels are baked into the image.
 */
export default function RiverWindowScene({ signs, loading }: RiverWindowSceneProps) {
  const frame = useCurrentFrame();
  const waterPhase = (frame * Math.PI * 2) / 120;
  const nearFrame = (frame * 1.5) % WINDOW_FRAMES;
  return (
    <AbsoluteFill className={styles.scene}>
      {[0, 1, 2, 3, 4, 5].map((slot) => {
        const x = scenePosition(frame, slot);
        if (x < -3240 || x > 1920) return null;
        const sign = signs.length ? signs[slot % signs.length] : null;
        return (
          <div
            key={slot}
            className={styles.worldTile}
            style={{ transform: `translate3d(${x}px,0,0)` }}
          >
            <Img src="/display/river-window/panorama.webp" className={styles.panorama} />
            <div
              className={styles.water}
              style={{ transform: `translateX(${Math.sin(waterPhase) * 2}px)` }}
            >
              <Img src="/display/river-window/panorama.webp" className={styles.panorama} />
            </div>
            <div className={styles.sign} data-river={sign?.slug ?? ''}>
              {sign ? (
                <>
                  <div className={styles.riverName}>{sign.name}</div>
                  <div className={styles.reading}>
                    {sign.value}
                    <small>{sign.unit}</small>
                  </div>
                  <div
                    className={styles.condition}
                    data-warning={sign.code === 'dangerous' || sign.code === 'high'}
                  >
                    {sign.condition}
                  </div>
                  <div className={styles.age}>
                    {sign.age}
                    {sign.trend ? ` · ${sign.trend}` : ''}
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.riverName}>River report</div>
                  <div className={styles.emptySign}>
                    {loading ? 'Checking the rivers…' : 'No readings available'}
                  </div>
                  <div className={styles.age}>eddy.guide</div>
                </>
              )}
            </div>
          </div>
        );
      })}
      <div
        className={styles.birds}
        style={{
          transform: `translate3d(${(frame % SCENE_STRIDE) * 1.3 - 400}px,${150 + Math.sin((frame * Math.PI) / 60) * 3}px,0)`,
        }}
        aria-hidden="true"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              marginTop: i * 11,
              transform: `scaleY(${0.6 + Math.sin((frame * Math.PI) / 15 + i) * 0.2})`,
            }}
          >
            ⌁
          </span>
        ))}
      </div>
      {[0, 1, 2, 3, 4, 5].map((slot) => {
        const x = scenePosition(nearFrame, slot, 3495);
        if (x < -3495 || x > 2050) return null;
        return (
          <Img
            key={slot}
            src="/display/river-window/foreground.webp"
            className={styles.foreground}
            style={{ transform: `translate3d(${x - 130}px,0,0)` }}
          />
        );
      })}
    </AbsoluteFill>
  );
}
