/** Remotion edit instruction types used across the app. */

/** Motion values for a rendered clip. */
export interface ClipMotion {
  scaleFrom?: number;
  scaleTo?: number;
  panXFrom?: number;
  panXTo?: number;
  panYFrom?: number;
  panYTo?: number;
  rotateFrom?: number;
  rotateTo?: number;
}

/** Small video styling controls for a clip. */
export interface ClipStyle {
  objectFit?: "cover" | "contain";
  borderRadius?: number;
  shadowColor?: string;
  shadowOpacity?: number;
  shadowBlur?: number;
}

/** A single clip in the Remotion timeline. */
export interface EditClip {
  id: string;
  name: string;
  duration: number;
  trimStart?: number;
  trimEnd?: number;
  playbackRate?: number;
  volume?: number;
  motion?: ClipMotion;
  style?: ClipStyle;
}

/** A supported overlay animation. */
export type OverlayAnimationType =
  | "fade"
  | "slide-up"
  | "slide-down"
  | "slide-left"
  | "slide-right"
  | "pop"
  | "pulse"
  | "drift"
  | "type-on";

/** One animation stage for an overlay. */
export interface OverlayAnimationStage {
  type: OverlayAnimationType;
  durationFrames?: number;
  distance?: number;
  strength?: number;
}

/** Enter, loop, and exit animation config. */
export interface OverlayAnimation {
  enter?: OverlayAnimationStage;
  loop?: OverlayAnimationStage;
  exit?: OverlayAnimationStage;
}

/** Text overlay rendered by Remotion. */
export interface TextOverlay {
  content: string;
  startFrame: number;
  endFrame: number;
  x: number;
  y: number;
  width?: number;
  fontSize: number;
  color: string;
  fontFamily?: string;
  fontWeight?: "400" | "500" | "600" | "700" | "800";
  textAlign?: "left" | "center" | "right";
  letterSpacing?: number;
  lineHeight?: number;
  backgroundColor?: string;
  padding?: number;
  borderRadius?: number;
  opacity?: number;
  animation?: OverlayAnimation;
}

/** Transition between two clips. */
export interface Transition {
  type: "fade" | "slide" | "wipe" | "zoom" | "dissolve";
  durationFrames: number;
}

/** Background look for the full frame. */
export interface BackgroundStyle {
  type?: "solid" | "gradient";
  color?: string;
  colors?: string[];
  angle?: number;
}

/** Audio config for the edit. */
export interface AudioConfig {
  volume: number;
  fadeInFrames?: number;
  fadeOutFrames?: number;
  muted?: boolean;
}

/** Full Remotion composition returned by the AI. */
export interface RemotionComposition {
  fps: number;
  width: number;
  height: number;
  background?: BackgroundStyle;
  clips: EditClip[];
  transitions: Transition[];
  overlays: TextOverlay[];
  audio: AudioConfig;
  totalDurationFrames: number;
}

/** Clip source info that the renderer can actually load. */
export interface RenderMediaClip {
  id: string;
  name: string;
  src: string;
  duration: number;
}

/** Input props passed into the Remotion composition. */
export type RemotionRenderProps = {
  composition: RemotionComposition;
  mediaClips: RenderMediaClip[];
};

/** Request body sent from the mobile app. */
export interface EditRequest {
  prompt: string;
  clips: { name: string; duration: number; thumbnail?: string }[];
}

/** Response returned to the mobile app. */
export interface EditResponse {
  success: boolean;
  composition?: RemotionComposition;
  clipId?: string;
  error?: string;
}
