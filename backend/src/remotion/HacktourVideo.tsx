/** Main Remotion composition used to render Hacktour videos. */
import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, useCurrentFrame } from "remotion";
import type { RemotionRenderProps, TextOverlay } from "../types/remotion";
import { getClipTransitionStyle, getOverlayPresentation } from "./clipStyle";
import { resolveTimelineClips } from "./timeline";

/** Render a complete Hacktour video using the real Remotion runtime. */
export const HacktourVideo = ({ composition, mediaClips }: RemotionRenderProps) => {
  const timeline = resolveTimelineClips(composition, mediaClips);

  return (
    <AbsoluteFill style={getBackgroundStyle(composition.background)}>
      {timeline.map((item) => (
        <Sequence key={`${item.clip.id}-${item.startFrame}`} from={item.startFrame} durationInFrames={item.durationInFrames}>
          <ClipLayer
            clip={item.clip}
            src={item.media.src}
            fps={composition.fps}
            durationInFrames={item.durationInFrames}
            transitionBefore={item.transitionBefore}
            transitionAfter={item.transitionAfter}
            globalVolume={composition.audio.muted ? 0 : composition.audio.volume ?? 1}
            fadeInFrames={composition.audio.fadeInFrames ?? 0}
            fadeOutFrames={composition.audio.fadeOutFrames ?? 0}
            totalDurationFrames={composition.totalDurationFrames}
          />
        </Sequence>
      ))}
      {composition.overlays.map((overlay, index) => (
        <Sequence key={`${overlay.content}-${overlay.startFrame}-${index}`} from={overlay.startFrame} durationInFrames={Math.max(1, overlay.endFrame - overlay.startFrame)}>
          <OverlayLayer overlay={overlay} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

/** Render one video layer with motion and transition effects. */
function ClipLayer({
  clip,
  src,
  fps,
  durationInFrames,
  transitionBefore,
  transitionAfter,
  globalVolume,
  fadeInFrames,
  fadeOutFrames,
  totalDurationFrames,
}: {
  clip: RemotionRenderProps["composition"]["clips"][number];
  src: string;
  fps: number;
  durationInFrames: number;
  transitionBefore: RemotionRenderProps["composition"]["transitions"][number] | undefined;
  transitionAfter: RemotionRenderProps["composition"]["transitions"][number] | undefined;
  globalVolume: number;
  fadeInFrames: number;
  fadeOutFrames: number;
  totalDurationFrames: number;
}) {
  const frame = useCurrentFrame();
  const motion = clip.motion ?? {};
  const transitionStyle = getClipTransitionStyle(frame, durationInFrames, transitionBefore, transitionAfter);
  const scale = interpolate(frame, [0, durationInFrames], [motion.scaleFrom ?? 1, motion.scaleTo ?? motion.scaleFrom ?? 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const translateX = interpolate(frame, [0, durationInFrames], [motion.panXFrom ?? 0, motion.panXTo ?? motion.panXFrom ?? 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const translateY = interpolate(frame, [0, durationInFrames], [motion.panYFrom ?? 0, motion.panYTo ?? motion.panYFrom ?? 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rotate = interpolate(frame, [0, durationInFrames], [motion.rotateFrom ?? 0, motion.rotateTo ?? motion.rotateFrom ?? 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        ...transitionStyle,
      }}
    >
      <OffthreadVideo
        src={src}
        trimBefore={Math.round((clip.trimStart ?? 0) * fps)}
        trimAfter={Math.round((clip.trimEnd ?? clip.duration) * fps)}
        playbackRate={clip.playbackRate ?? 1}
        volume={(f) => getClipVolume(f, durationInFrames, totalDurationFrames, clip.volume ?? 1, globalVolume, fadeInFrames, fadeOutFrames)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: clip.style?.objectFit ?? "cover",
          borderRadius: clip.style?.borderRadius ?? 0,
          boxShadow: clip.style?.shadowColor
            ? `0 24px ${clip.style.shadowBlur ?? 80}px rgba(0,0,0,${clip.style.shadowOpacity ?? 0.35})`
            : undefined,
          transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale}) rotate(${rotate}deg)`,
        }}
      />
    </AbsoluteFill>
  );
}

/** Render one timed text overlay with Remotion animation. */
function OverlayLayer({ overlay }: { overlay: TextOverlay }) {
  const frame = useCurrentFrame();
  const presentation = getOverlayPresentation(frame, overlay);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: `${overlay.x * 100}%`,
          top: `${overlay.y * 100}%`,
          width: overlay.width ? `${overlay.width * 100}%` : "auto",
          transform: `translate(-50%, -50%) ${presentation.style.transform ?? ""}`,
          opacity: presentation.style.opacity,
          color: overlay.color,
          fontFamily: overlay.fontFamily ?? "Inter, Arial, sans-serif",
          fontSize: overlay.fontSize,
          fontWeight: overlay.fontWeight ?? "700",
          lineHeight: overlay.lineHeight ?? 1.15,
          letterSpacing: overlay.letterSpacing ?? 0,
          textAlign: overlay.textAlign ?? "center",
          backgroundColor: overlay.backgroundColor ?? "transparent",
          padding: overlay.padding ?? 0,
          borderRadius: overlay.borderRadius ?? 0,
          textShadow: "0 8px 24px rgba(0,0,0,0.35)",
          whiteSpace: "pre-wrap",
        }}
      >
        {presentation.text}
      </div>
    </AbsoluteFill>
  );
}

/** Map composition background settings into CSS. */
function getBackgroundStyle(background: RemotionRenderProps["composition"]["background"]): React.CSSProperties {
  if (background?.type === "gradient" && background.colors?.length) {
    return {
      backgroundImage: `linear-gradient(${background.angle ?? 180}deg, ${background.colors.join(", ")})`,
    };
  }

  return { backgroundColor: background?.color ?? "#000000" };
}

/** Keep clip audio smooth across the whole composition. */
function getClipVolume(
  frame: number,
  durationInFrames: number,
  totalDurationFrames: number,
  clipVolume: number,
  globalVolume: number,
  fadeInFrames: number,
  fadeOutFrames: number
) {
  const fadeIn = fadeInFrames > 0 ? interpolate(frame, [0, fadeInFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  const fadeOut = fadeOutFrames > 0
    ? interpolate(frame, [Math.max(0, durationInFrames - fadeOutFrames), durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;
  const safeTotal = Math.max(1, totalDurationFrames);
  const globalRamp = interpolate(frame, [0, safeTotal], [1, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return clipVolume * globalVolume * fadeIn * fadeOut * globalRamp;
}
