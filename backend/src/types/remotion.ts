/** Remotion edit instruction types used across the app */

/** A single clip in the edit timeline */
export interface EditClip {
  id: string;
  name: string;
  duration: number;
  trimStart?: number;
  trimEnd?: number;
}

/** Text overlay on the video */
export interface TextOverlay {
  content: string;
  startFrame: number;
  endFrame: number;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontFamily?: string;
}

/** Transition between two clips */
export interface Transition {
  type: "fade" | "slide" | "wipe" | "zoom" | "dissolve";
  durationFrames: number;
}

/** Audio config for the edit */
export interface AudioConfig {
  src?: string;
  volume: number;
  fadeInFrames?: number;
  fadeOutFrames?: number;
}

/** Full Remotion composition returned by the AI */
export interface RemotionComposition {
  fps: number;
  width: number;
  height: number;
  clips: EditClip[];
  transitions: Transition[];
  overlays: TextOverlay[];
  audio: AudioConfig;
  totalDurationFrames: number;
}

/** Request body sent from the mobile app */
export interface EditRequest {
  prompt: string;
  clips: { name: string; duration: number; thumbnail?: string }[];
}

/** Response returned to the mobile app */
export interface EditResponse {
  success: boolean;
  composition?: RemotionComposition;
  clipId?: string;
  error?: string;
}
