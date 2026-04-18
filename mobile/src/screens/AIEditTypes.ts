/** Shared types and prompt presets for the AI edit screen. */
export interface VideoClip {
  id: string;
  name: string;
  duration: string;
}

/** Quick prompts the user can tap. */
export const QUICK_PROMPTS = [
  "Add subtitles",
  "Remove silence",
  "Add transitions",
  "Color grade",
  "Add music",
  "Zoom on action",
  "Clip",
];
