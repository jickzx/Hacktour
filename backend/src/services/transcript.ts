/**
 * Transcript service — transcribe each uploaded source clip with Gemini and
 * project the resulting timed segments onto the final Remotion comp timeline.
 *
 * Why this exists: the AI plans a comp that trims, reorders, re-speeds and
 * overlaps source clips. A subtitle segment at source-seconds 0–2 on clip B
 * does NOT sit at comp-seconds 0–2 on the output. Ignoring that is the
 * single biggest reason subtitles drift further behind the later a video
 * plays. This file is the offset-aware re-timer.
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import type { RemotionComposition, TextOverlay } from "../types/remotion";
import { getGeminiModel } from "./modelConfig";

/** One spoken segment on a single source clip. Times are in *source* seconds. */
export interface TranscriptSegment {
  text: string;
  startSec: number;
  endSec: number;
}

/** All transcript segments for one uploaded source file, keyed by its name. */
export interface SourceTranscript {
  /** Must equal the name the AI uses in `composition.clips[i].name`. */
  name: string;
  segments: TranscriptSegment[];
}

const TRANSCRIBE_PROMPT = `Transcribe EXACTLY what is spoken in this video. Return a JSON array of timed subtitle segments like:
[{"text":"Hello everyone","startSec":0.5,"endSec":2.1},{"text":"Welcome to my stream","startSec":2.3,"endSec":4.0}]
Each segment should be 3-8 words max for readable subtitles. Cover ALL speech. Use the video's own audio timeline (wall-clock seconds from the start of the file). Return ONLY the JSON array, no markdown.`;

/** Transcribe one video file into an array of timed segments. Returns [] on failure. */
export async function transcribeClipFile(filePath: string, mimeType: string): Promise<TranscriptSegment[]> {
  if (!process.env.GEMINI_API_KEY) return [];
  try {
    const base64 = fs.readFileSync(filePath).toString("base64");
    const result = await getGeminiModel("transcription").generateContent([
      { inlineData: { mimeType, data: base64 } },
      TRANSCRIBE_PROMPT,
    ]);
    const raw = result.response.text().trim();
    const arrMatch = raw.match(/\[[\s\S]*\]/);
    if (!arrMatch) return [];
    const parsed = JSON.parse(arrMatch[0]) as TranscriptSegment[];
    // Minimal sanity: drop anything without text or with impossible timing
    return parsed
      .filter((s) => s && typeof s.text === "string" && s.text.trim().length > 0)
      .map((s) => ({
        text: s.text.trim(),
        startSec: Math.max(0, Number(s.startSec) || 0),
        endSec: Math.max(Number(s.startSec) || 0, Number(s.endSec) || 0),
      }))
      .filter((s) => s.endSec > s.startSec);
  } catch (err: any) {
    console.warn(`[transcript] failed for ${path.basename(filePath)}: ${err?.message || err}`);
    return [];
  }
}

/**
 * Walk every comp clip and emit correctly-offset subtitle overlays.
 *
 * Timing math per comp clip C sourcing segments from source S:
 *
 *   trimStart      = C.trimStart   (source seconds trimmed off the front)
 *   trimEnd        = C.trimEnd
 *   rate           = C.playbackRate
 *   compStartFrame = offset of C inside the concatenated output timeline
 *                    (takes transition overlap into account)
 *
 * For each segment seg in S:
 *   1. Clip the segment to [trimStart, trimEnd] in source seconds.
 *   2. Shift to clip-local seconds: s' = s - trimStart
 *   3. Scale by playbackRate: s'' = s' / rate
 *   4. Convert to frames and shift into comp: f = compStartFrame + s'' * fps
 *
 * If the segment is entirely outside the trim window it's skipped.
 * Duplicate comp clips (same source used twice) get duplicate overlays,
 * each offset into its own appearance. That's intentional.
 */
export function projectTranscriptsToOverlays(
  sources: SourceTranscript[],
  composition: RemotionComposition
): TextOverlay[] {
  const fps = composition.fps;
  const total = composition.totalDurationFrames;
  const bySource = new Map<string, TranscriptSegment[]>();
  for (const s of sources) bySource.set(s.name, s.segments);

  const overlays: TextOverlay[] = [];
  let cursor = 0;
  let fellBack = 0;

  for (let i = 0; i < composition.clips.length; i++) {
    const clip = composition.clips[i];
    const transitionBefore = i > 0 ? composition.transitions[i - 1] : undefined;
    if (i > 0 && transitionBefore) cursor -= Math.max(0, transitionBefore.durationFrames);

    const clipStartFrame = cursor;
    const trimStart = Math.max(0, clip.trimStart ?? 0);
    const trimEnd = Math.max(trimStart + 0.001, clip.trimEnd ?? clip.duration);
    const rate = clip.playbackRate && clip.playbackRate > 0 ? clip.playbackRate : 1;
    const trimmedSeconds = Math.max(0.1, trimEnd - trimStart);
    const clipFrames = Math.max(1, Math.round((trimmedSeconds * fps) / rate));

    // Primary match by name; fallback to the source at the same index if the AI
    // renamed the clip in the plan (keeps subtitles appearing rather than vanishing)
    let segments = bySource.get(clip.name);
    if (!segments && sources[i]) {
      segments = sources[i].segments;
      fellBack += 1;
    }
    segments = segments ?? [];
    for (const seg of segments) {
      // Clip to trim window (still in source seconds)
      const startInSrc = Math.max(trimStart, seg.startSec);
      const endInSrc   = Math.min(trimEnd,   seg.endSec);
      if (endInSrc <= startInSrc) continue; // segment entirely outside this trim

      // Convert to comp-local seconds for this clip appearance
      const localStart = (startInSrc - trimStart) / rate;
      const localEnd   = (endInSrc   - trimStart) / rate;

      // Absolute frames in the comp timeline, clamped to this clip's span
      const absStart = clipStartFrame + Math.round(localStart * fps);
      const absEndRaw = clipStartFrame + Math.round(localEnd * fps);
      const absEnd = Math.min(clipStartFrame + clipFrames, absEndRaw);
      if (absEnd <= absStart) continue;

      // Final clamp against the whole comp (catches off-by-one at the tail)
      const finalStart = Math.min(absStart, total - 1);
      const finalEnd   = Math.min(absEnd,   total);
      if (finalEnd <= finalStart) continue;

      overlays.push({
        content: seg.text,
        startFrame: finalStart,
        endFrame: finalEnd,
        x: 0.5,
        y: 0.88,
        width: 0.82,
        fontSize: 52,
        color: "#ffffff",
        fontWeight: "700",
        textAlign: "center",
        backgroundColor: "rgba(0,0,0,0.28)",
        padding: 20,
        borderRadius: 24,
        animation: { enter: { type: "fade", durationFrames: 6 } },
      });
    }

    cursor += clipFrames;
  }

  if (fellBack > 0) {
    console.warn(`[transcript] ${fellBack} comp clip(s) did not match by name — used index fallback`);
  }
  // Ensure overlays are sorted by start time (nicer for debugging, doesn't affect rendering)
  overlays.sort((a, b) => a.startFrame - b.startFrame);
  return overlays;
}

/** ffprobe the actual rendered duration in seconds. Returns null if probe fails. */
export function probeVideoDurationSeconds(filePath: string): number | null {
  try {
    const ffprobePath = process.env.FFPROBE_PATH?.trim() ||
      (() => {
        try { return execFileSync("which", ["ffprobe"], { encoding: "utf8" }).trim(); } catch { return "ffprobe"; }
      })();
    const out = execFileSync(ffprobePath, [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ], { encoding: "utf8" }).trim();
    const n = Number(out);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
