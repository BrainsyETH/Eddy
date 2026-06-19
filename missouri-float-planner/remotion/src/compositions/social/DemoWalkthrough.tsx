import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors } from "../../design-tokens/colors";
import { fontFamilies } from "../../design-tokens/fonts";
import { ENTRANCE } from "../../lib/spring-presets";
import { reelLoopOpacity } from "../../lib/reel-safe";
import { DemoCaption } from "../../components/DemoCaption";
import { EddyMascot, type EddyVariant } from "../../components/EddyMascot";
import { Watermark } from "../../components/Watermark";
import {
  DEMO_FPS,
  DEMO_SOURCE,
  ENDCARD_SECONDS,
  clipDurationInFrames,
  footageSegments,
  segmentFrames,
  totalDurationInFrames,
  variantClips,
  type Clip,
  type FootageClip,
  type Transition,
  type Variant,
} from "../../lib/demo-edl";

/**
 * Demo Walkthrough — a tightened, branded cut of the raw eddy.guide screen
 * recording, driven entirely by src/lib/demo-edl.ts. Full-bleed footage with
 * eased speed-ramps on the long scrolls, hand-rolled zoom-punch / whip /
 * dip-to-brand transitions, muted-safe captions, Eddy pop-ins, a lo-fi music
 * bed, and the shared brand end card.
 *
 * Render-safe: with `sourceSrc=""` it renders a branded storyboard (one card
 * per clip) so the structure previews and CI passes before the recording lands
 * in /public.
 */
export type DemoWalkthroughProps = {
  /** Source file in /public. "" → branded storyboard placeholder mode. */
  sourceSrc: string;
  /** Length cut: "short" ≈ :30, "full" ≈ :40. */
  variant: Variant;
  /** Muted-safe lower-third captions on/off. */
  captions: boolean;
  /** Lo-fi music bed on/off. */
  music: boolean;
  /** Music file in /public. */
  musicSrc: string;
  /** Sung "Eddy dot guide" hook over the end card (drop the asset first). */
  hook: boolean;
  /** Hook file in /public. */
  hookSrc: string;
  /** Eddy mascot pop-ins on/off. */
  showMascot: boolean;
  /**
   * Vertical anchor for the footage. The source (≈9:19.5) is taller than 9:16,
   * so filling a 1080×1920 frame crops top/bottom — nudge this (e.g.
   * "center 42%") to keep the important UI in frame.
   */
  videoObjectPosition: string;
};

/** Composition duration for a variant — wire into `calculateMetadata`. */
export function getDemoDuration(variant: Variant): number {
  return totalDurationInFrames(variant);
}

/** Frames a transition occupies on each side of a cut. */
const TRANSITION = 8;

export const DemoWalkthrough: React.FC<DemoWalkthroughProps> = (props) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const clips = variantClips(props.variant);

  // Clean auto-loop: end state matches start (both faded to brand).
  const loopOpacity = reelLoopOpacity(frame, durationInFrames);

  let cursor = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: colors.primary[900], opacity: loopOpacity }}>
      {clips.map((clip, i) => {
        const dur = clipDurationInFrames(clip);
        const from = cursor;
        cursor += dur;
        // The exit treatment mirrors the NEXT clip's entrance, so both sides of
        // the cut animate together (zoom-punch, whip, dip).
        const exit: Transition = clips[i + 1]?.entrance ?? "none";
        return (
          <Sequence key={clip.id} from={from} durationInFrames={dur} name={`${clip.id} · ${clip.label}`}>
            <ClipScene clip={clip} exit={exit} {...props} />
          </Sequence>
        );
      })}

      {/* Persistent brand mark — same component every other reel uses. */}
      <Watermark format="portrait" />

      {/* Lo-fi bed under the whole cut, faded in/out. */}
      {props.music ? (
        <Audio
          src={staticFile(props.musicSrc)}
          volume={(f) =>
            interpolate(
              f,
              [0, 18, durationInFrames - 24, durationInFrames],
              [0, 0.55, 0.55, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          }
        />
      ) : null}

      {/* Sung "Eddy dot guide" hook lands on the end card. */}
      {props.hook ? (
        <Sequence from={Math.max(0, durationInFrames - Math.round(ENDCARD_SECONDS * DEMO_FPS))}>
          <Audio src={staticFile(props.hookSrc)} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

// ─── One scene ───────────────────────────────────────────────────────────────

type ClipSceneProps = DemoWalkthroughProps & { clip: Clip; exit: Transition };

const ClipScene: React.FC<ClipSceneProps> = ({ clip, exit, ...props }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  if (clip.kind === "endcard") {
    return <EndCardScene showMascot={props.showMascot} />;
  }

  // Entrance over the first TRANSITION frames; exit over the last.
  const inP = interpolate(frame, [0, TRANSITION], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const outP = interpolate(frame, [durationInFrames - TRANSITION, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const { transform, opacity, veil } = transitionStyle(clip.entrance, exit, inP, outP);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.primary[900], overflow: "hidden" }}>
      <AbsoluteFill style={{ transform, opacity }}>
        {props.sourceSrc === "" ? (
          <PlaceholderCard clip={clip} />
        ) : (
          <FootageLayer clip={clip} sourceSrc={props.sourceSrc} objectPosition={props.videoObjectPosition} />
        )}
      </AbsoluteFill>

      {/* Dip-to-brand veil rides over the cut. */}
      {veil > 0 ? (
        <AbsoluteFill style={{ backgroundColor: colors.primary[900], opacity: veil, pointerEvents: "none" }} />
      ) : null}

      {props.captions ? <DemoCaption text={clip.caption} /> : null}
      {props.showMascot && clip.mascot ? <MascotPop variant={clip.mascot} /> : null}
    </AbsoluteFill>
  );
};

/** Combined transform / opacity / brand-veil for a clip's entrance + exit. */
function transitionStyle(entrance: Transition, exit: Transition, inP: number, outP: number) {
  let scale = 1;
  let tx = 0;
  let opacity = 1;
  let veil = 0;

  // Entrance (drives off inP: 0 → 1 over the first frames)
  if (entrance === "zoom") {
    scale *= interpolate(inP, [0, 1], [1.12, 1]);
  } else if (entrance === "whip") {
    tx += interpolate(inP, [0, 1], [140, 0]);
    opacity *= interpolate(inP, [0, 1], [0.4, 1]);
  } else if (entrance === "dip") {
    veil = Math.max(veil, 1 - inP);
  }

  // Exit (drives off outP: 0 → 1 over the last frames)
  if (exit === "zoom") {
    scale *= interpolate(outP, [0, 1], [1, 1.1]);
  } else if (exit === "whip") {
    tx += interpolate(outP, [0, 1], [0, -140]);
    opacity *= interpolate(outP, [0, 1], [1, 0.4]);
  } else if (exit === "dip") {
    veil = Math.max(veil, outP);
  }

  return { transform: `scale(${scale}) translateX(${tx}px)`, opacity, veil };
}

// ─── Footage ─────────────────────────────────────────────────────────────────

/**
 * Plays a footage clip as a chain of constant-rate slices (one for a plain
 * clip, several for an eased ramp). Each slice seeks the source with
 * startFrom/endAt (composition frames = source seconds × fps) and applies its
 * own playbackRate. The footage is muted — the music bed carries the audio.
 */
const FootageLayer: React.FC<{ clip: FootageClip; sourceSrc: string; objectPosition: string }> = ({
  clip,
  sourceSrc,
  objectPosition,
}) => {
  const segments = footageSegments(clip);
  let cursor = 0;
  return (
    <>
      {segments.map((seg, i) => {
        const dur = segmentFrames(seg);
        const from = cursor;
        cursor += dur;
        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            <OffthreadVideo
              // "#t=0," makes preview seeking snappier on big trim jumps.
              src={`${staticFile(sourceSrc)}#t=0,`}
              startFrom={Math.round(seg.srcIn * DEMO_FPS)}
              endAt={Math.round(seg.srcOut * DEMO_FPS)}
              playbackRate={seg.speed}
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition }}
            />
          </Sequence>
        );
      })}
    </>
  );
};

/** Branded storyboard card shown per clip when no source video is wired yet. */
const PlaceholderCard: React.FC<{ clip: FootageClip }> = ({ clip }) => {
  const treatment = clip.ramp ? `ramp → ${clip.speed}×` : clip.speed === 1 ? "real-time" : `${clip.speed}×`;
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${colors.primary[700]}, ${colors.primary[900]})`,
        alignItems: "center",
        justifyContent: "center",
        padding: 80,
        textAlign: "center",
      }}
    >
      <div style={{ fontFamily: fontFamilies.display, color: colors.primary[100], fontSize: 44, letterSpacing: 2, textTransform: "uppercase" }}>
        {clip.id} · {clip.label}
      </div>
      <div style={{ fontFamily: fontFamilies.body, color: "rgba(255,255,255,0.55)", fontSize: 28, marginTop: 22 }}>
        {clip.srcIn.toFixed(1)}s – {clip.srcOut.toFixed(1)}s · {treatment}
      </div>
      <div style={{ fontFamily: fontFamilies.body, color: "rgba(255,255,255,0.32)", fontSize: 22, marginTop: 64, maxWidth: 720 }}>
        storyboard preview — drop {DEMO_SOURCE} in /public and set sourceSrc
      </div>
    </AbsoluteFill>
  );
};

// ─── Overlays ────────────────────────────────────────────────────────────────

/** Small Eddy peeking up from the bottom-left between cuts. */
const MascotPop: React.FC<{ variant: EddyVariant }> = ({ variant }) => (
  <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "flex-start", paddingLeft: 44, paddingBottom: 520 }}>
    <EddyMascot variant={variant} size={150} delay={6} />
  </AbsoluteFill>
);

/** Brand outro: dip in from brand, Eddy waves, logo lockup + CTA line. */
const EndCardScene: React.FC<{ showMascot: boolean }> = ({ showMascot }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const veil = interpolate(frame, [0, 8], [1, 0], { extrapolateRight: "clamp" });
  const logoIn = spring({ frame: frame - 4, fps, config: ENTRANCE });
  const scale = interpolate(logoIn, [0, 1], [0.94, 1]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.primary[900],
        alignItems: "center",
        justifyContent: "center",
        fontFamily: fontFamilies.display,
      }}
    >
      {showMascot ? <EddyMascot variant="canoe" size={300} delay={2} /> : null}

      <div style={{ transform: `scale(${scale})`, textAlign: "center", marginTop: 28 }}>
        <div style={{ fontSize: 110, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>
          eddy<span style={{ color: colors.accent[400] }}>.guide</span>
        </div>
        <div style={{ fontSize: 42, fontWeight: 500, color: colors.primary[100], marginTop: 14, fontFamily: fontFamilies.body }}>
          Check it before you float.
        </div>
      </div>

      {/* dip-to-brand veil fading out as the end card lands */}
      <AbsoluteFill style={{ backgroundColor: colors.primary[900], opacity: veil, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
