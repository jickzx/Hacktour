/** Timeline helpers for Remotion clip sequencing. */
import type { EditClip, RemotionComposition, RenderMediaClip, Transition } from "../types/remotion";

/** One resolved clip span inside the Remotion timeline. */
export interface TimelineClip {
  clip: EditClip;
  media: RenderMediaClip;
  startFrame: number;
  durationInFrames: number;
  transitionBefore?: Transition;
  transitionAfter?: Transition;
}

/** Match AI clip order back to the uploaded media sources. */
export function resolveTimelineClips(
  composition: RemotionComposition,
  mediaClips: RenderMediaClip[]
): TimelineClip[] {
  const unused = [...mediaClips];
  const timeline: TimelineClip[] = [];
  let cursor = 0;

  for (let i = 0; i < composition.clips.length; i += 1) {
    const clip = composition.clips[i];
    const matchIndex = unused.findIndex((media) => media.name === clip.name || media.id === clip.id);
    const media = unused[matchIndex >= 0 ? matchIndex : 0];

    if (!media) break;
    unused.splice(matchIndex >= 0 ? matchIndex : 0, 1);

    const durationInFrames = getClipFrames(clip, composition.fps);
    const transitionBefore = i > 0 ? composition.transitions[i - 1] : undefined;
    const transitionAfter = composition.transitions[i];

    if (i > 0 && transitionBefore) {
      cursor -= transitionBefore.durationFrames;
    }

    timeline.push({
      clip,
      media,
      startFrame: cursor,
      durationInFrames,
      transitionBefore,
      transitionAfter,
    });

    cursor += durationInFrames;
  }

  return timeline;
}

/** Convert clip seconds and playback speed into rendered frames. */
export function getClipFrames(clip: EditClip, fps: number): number {
  const trimStart = clip.trimStart ?? 0;
  const trimEnd = clip.trimEnd ?? clip.duration;
  const seconds = Math.max(0.1, trimEnd - trimStart);
  return Math.max(1, Math.round((seconds * fps) / (clip.playbackRate ?? 1)));
}
