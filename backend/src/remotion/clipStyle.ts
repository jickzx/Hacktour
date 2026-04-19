/** Helpers for Remotion clip and overlay animation styles. */
import { interpolate, spring, Easing } from "remotion";
import type { OverlayAnimationStage, TextOverlay, Transition } from "../types/remotion";

/** Build clip enter and exit transforms from a transition. */
export function getClipTransitionStyle(
  frame: number,
  durationInFrames: number,
  transitionBefore?: Transition,
  transitionAfter?: Transition
): React.CSSProperties {
  const style: React.CSSProperties = { opacity: 1, transform: "translate3d(0,0,0) scale(1)", clipPath: "inset(0 0 0 0)" };

  if (transitionBefore) {
    const progress = interpolate(frame, [0, transitionBefore.durationFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
    applyTransition(style, transitionBefore, progress, true);
  }

  if (transitionAfter) {
    const progress = interpolate(frame, [durationInFrames - transitionAfter.durationFrames, durationInFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic),
    });
    applyTransition(style, transitionAfter, progress, false);
  }

  return style;
}

/** Build overlay opacity, transform, and animated text state. */
export function getOverlayPresentation(frame: number, overlay: TextOverlay) {
  const enter = animateStage(frame, overlay.animation?.enter, true);
  const exit = animateStage(overlay.endFrame - overlay.startFrame - frame, overlay.animation?.exit, false);
  const loop = animateLoop(frame, overlay.animation?.loop);
  const typedText = getTypedText(frame, overlay);

  return {
    text: typedText,
    style: {
      opacity: (overlay.opacity ?? 1) * enter.opacity * exit.opacity * loop.opacity,
      transform: `${enter.transform} ${loop.transform} ${exit.transform}`.trim(),
    } as React.CSSProperties,
  };
}

/** Turn one animation stage into a simple style change. */
function animateStage(frame: number, stage: OverlayAnimationStage | undefined, entering: boolean) {
  if (!stage) return { opacity: 1, transform: "translate3d(0,0,0) scale(1)" };

  const frames = Math.max(1, stage.durationFrames ?? 18);
  const progress = entering
    ? spring({ frame, fps: 30, durationInFrames: frames, config: { damping: 200 } })
    : interpolate(frame, [0, frames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const distance = stage.distance ?? 60;
  const strength = stage.strength ?? 1;

  switch (stage.type) {
    case "slide-up":
      return { opacity: progress, transform: `translate3d(0, ${(1 - progress) * distance}px, 0) scale(1)` };
    case "slide-down":
      return { opacity: progress, transform: `translate3d(0, ${(progress - 1) * distance}px, 0) scale(1)` };
    case "slide-left":
      return { opacity: progress, transform: `translate3d(${(1 - progress) * distance}px, 0, 0) scale(1)` };
    case "slide-right":
      return { opacity: progress, transform: `translate3d(${(progress - 1) * distance}px, 0, 0) scale(1)` };
    case "pop":
      return { opacity: progress, transform: `translate3d(0,0,0) scale(${0.86 + progress * 0.14 * strength})` };
    default:
      return { opacity: progress, transform: "translate3d(0,0,0) scale(1)" };
  }
}

/** Keep overlays alive with a small loop motion when asked. */
function animateLoop(frame: number, stage: OverlayAnimationStage | undefined) {
  if (!stage) return { opacity: 1, transform: "translate3d(0,0,0) scale(1)" };
  const wave = Math.sin(frame / 12) * (stage.strength ?? 1);

  switch (stage.type) {
    case "pulse":
      return { opacity: 1, transform: `translate3d(0,0,0) scale(${1 + wave * 0.03})` };
    case "drift":
      return { opacity: 1, transform: `translate3d(${wave * 8}px, ${wave * -4}px, 0) scale(1)` };
    default:
      return { opacity: 1, transform: "translate3d(0,0,0) scale(1)" };
  }
}

/** Reveal one character at a time for type-on overlays. */
function getTypedText(frame: number, overlay: TextOverlay) {
  const enter = overlay.animation?.enter;
  if (enter?.type !== "type-on") return overlay.content;
  const frames = Math.max(1, enter.durationFrames ?? 18);
  const visible = Math.ceil(interpolate(frame, [0, frames], [0, overlay.content.length], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));
  return overlay.content.slice(0, visible);
}

/** Mutate one clip style object to apply the transition. */
function applyTransition(style: React.CSSProperties, transition: Transition, progress: number, entering: boolean) {
  switch (transition.type) {
    case "fade":
    case "dissolve":
      style.opacity = entering ? progress : 1 - progress;
      return;
    case "slide":
      style.opacity = entering ? progress : 1 - progress * 0.4;
      style.transform = entering
        ? `translate3d(${(1 - progress) * 14}%,0,0) scale(1)`
        : `translate3d(${-progress * 14}%,0,0) scale(1)`;
      return;
    case "wipe":
      style.opacity = 1;
      style.clipPath = entering
        ? `inset(0 ${(1 - progress) * 100}% 0 0)`
        : `inset(0 0 0 ${progress * 100}%)`;
      return;
    case "zoom":
      style.opacity = entering ? progress : 1 - progress;
      style.transform = entering
        ? `translate3d(0,0,0) scale(${1.12 - progress * 0.12})`
        : `translate3d(0,0,0) scale(${1 - progress * 0.08})`;
      return;
  }
}
