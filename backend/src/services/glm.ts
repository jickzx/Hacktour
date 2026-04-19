/**
 * Composition service — two-step pipeline using Gemini:
 * Step 1: Gemini analyzes video thumbnails to understand content.
 * Step 2: Gemini uses that context to generate a real Remotion scene JSON.
 */
import type { RemotionComposition, EditRequest } from "../types/remotion";
import { getGeminiModel } from "./modelConfig";

const VISION_SYSTEM_PROMPT = `You are a video analysis AI. You will be given thumbnail images from video clips along with their filenames and durations.

Analyze each thumbnail and describe what you see. Focus on:
- Scene type (indoor, outdoor, studio, etc.)
- Subjects (people, objects, text on screen)
- Action (talking, moving, static)
- Visual style (dark, bright, colorful, moody)
- Any text or graphics visible

Return a concise analysis for each clip. Keep it brief but descriptive.`;

const REMOTION_SYSTEM_PROMPT = `You are a video editing AI that outputs a Remotion scene JSON.

You will receive:
1. Video context analysis from thumbnail inspection
2. The user's editing instructions
3. A VIDEO TRANSCRIPT with timed segments (if available) — use these to create subtitle overlays

Return a valid JSON object matching this exact schema:

{
  "fps": 30,
  "width": 1080,
  "height": 1920,
  "background": { "type": "solid|gradient", "color": "#09090b", "colors": ["#09090b", "#1f2937"], "angle": 180 },
  "clips": [{
    "id": "string",
    "name": "string",
    "duration": number_seconds,
    "trimStart": 0,
    "trimEnd": number_seconds,
    "playbackRate": 1,
    "volume": 1,
    "motion": { "scaleFrom": 1, "scaleTo": 1.08, "panXFrom": 0, "panXTo": 0, "panYFrom": 0, "panYTo": -40, "rotateFrom": 0, "rotateTo": 0 },
    "style": { "objectFit": "cover", "borderRadius": 0, "shadowColor": "#000000", "shadowOpacity": 0.3, "shadowBlur": 80 }
  }],
  "transitions": [{ "type": "fade|slide|wipe|zoom|dissolve", "durationFrames": number }],
  "overlays": [{
    "content": "text",
    "startFrame": number,
    "endFrame": number,
    "x": 0.5,
    "y": 0.9,
    "width": 0.82,
    "fontSize": 52,
    "color": "#ffffff",
    "fontFamily": "Inter, Arial, sans-serif",
    "fontWeight": "700",
    "textAlign": "center",
    "letterSpacing": 0,
    "lineHeight": 1.12,
    "backgroundColor": "rgba(0,0,0,0.18)",
    "padding": 20,
    "borderRadius": 24,
    "opacity": 1,
    "animation": {
      "enter": { "type": "fade|slide-up|slide-down|slide-left|slide-right|pop|type-on", "durationFrames": 18, "distance": 60, "strength": 1 },
      "loop": { "type": "pulse|drift", "strength": 1 },
      "exit": { "type": "fade|slide-up|slide-down|slide-left|slide-right|pop", "durationFrames": 12, "distance": 40, "strength": 1 }
    }
  }],
  "audio": { "volume": 0.8, "fadeInFrames": 20, "fadeOutFrames": 20, "muted": false },
  "totalDurationFrames": number
}

CRITICAL RULES:
- This JSON will be rendered by real Remotion components. Use motion, transitions, and overlay animation fields to create a polished result.
- If the prompt mentions subtitles and a VIDEO TRANSCRIPT is provided, create one overlay entry per transcript segment.
- Subtitle overlays should use x=0.5, y=0.88, width around 0.82, fontSize around 52, white text, and a subtle dark background.
- If no transcript but subtitles are requested, create placeholder subtitle overlays every 3 seconds.
- x and y are normalized 0-1 positions.
- Keep transition count at clips.length - 1 or less.
- totalDurationFrames must account for clip trims and transition overlap.
- Return ONLY the JSON object, no markdown fences, no explanation`;

async function analyzeVideoContext(request: EditRequest): Promise<string> {
  const clipsWithThumbs = request.clips.filter((c) => c.thumbnail).slice(0, 1);

  if (clipsWithThumbs.length === 0) {
    return "No thumbnails provided. Clip details:\n" +
      request.clips.map((c) => `- ${c.name} (${c.duration}s)`).join("\n");
  }

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    {
      text: `${VISION_SYSTEM_PROMPT}\n\nAnalyze these video clip thumbnails:\n\n${request.clips.map((c) => `- ${c.name} (${c.duration}s)`).join("\n")}`,
    },
    ...clipsWithThumbs.map((c) => {
      // thumbnail is a data URL like "data:image/jpeg;base64,..."
      const match = c.thumbnail!.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        return { inlineData: { mimeType: match[1], data: match[2] } };
      }
      return { text: `[thumbnail unavailable for ${c.name}]` };
    }),
  ];

  const result = await getGeminiModel("videoComposition").generateContent(parts);
  return result.response.text().trim() || "No context available";
}

async function generateRemotionComposition(
  context: string,
  request: EditRequest
): Promise<RemotionComposition> {
  const userMessage = `${REMOTION_SYSTEM_PROMPT}\n\nVideo Context Analysis:\n${context}\n\nClips:\n${request.clips.map((c) => `- ${c.name} (${c.duration}s)`).join("\n")}\n\nEdit instructions: ${request.prompt}`;

  const result = await getGeminiModel("videoComposition").generateContent(userMessage);
  const rawContent = result.response.text().trim();

  const jsonStr = rawContent
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```$/m, "")
    .trim();

  const composition: RemotionComposition = JSON.parse(jsonStr);
  return normalizeComposition(composition);
}

export async function generateComposition(request: EditRequest): Promise<RemotionComposition> {
  let context = "";

  try {
    context = await analyzeVideoContext(request);
  } catch {
    context = "Thumbnail analysis unavailable. Use clip names, durations, and the user prompt only.";
  }

  return generateRemotionComposition(context, request);
}

function validateComposition(c: RemotionComposition): void {
  if (!c.fps || !c.width || !c.height) {
    throw new Error("Composition missing required dimensions");
  }
  if (!Array.isArray(c.clips) || c.clips.length === 0) {
    throw new Error("Composition must have at least one clip");
  }
}

/** Normalize AI output into a stable Remotion shape. */
function normalizeComposition(c: RemotionComposition): RemotionComposition {
  const normalized: RemotionComposition = {
    fps: Math.max(1, c.fps || 30),
    width: c.width || 1080,
    height: c.height || 1920,
    background: c.background?.type === "gradient"
      ? { type: "gradient", colors: c.background.colors?.length ? c.background.colors : ["#09090b", "#1f2937"], angle: c.background.angle ?? 180 }
      : { type: "solid", color: c.background?.color ?? "#000000" },
    clips: c.clips.map((clip, index) => ({
      id: clip.id || String(index),
      name: clip.name,
      duration: Math.max(0.1, clip.duration),
      trimStart: Math.max(0, clip.trimStart ?? 0),
      trimEnd: Math.max(clip.trimStart ?? 0.1, clip.trimEnd ?? clip.duration),
      playbackRate: clip.playbackRate ?? 1,
      volume: clip.volume ?? 1,
      motion: clip.motion ?? { scaleFrom: 1, scaleTo: 1.04 },
      style: clip.style ?? { objectFit: "cover" },
    })),
    transitions: (c.transitions ?? []).slice(0, Math.max(0, c.clips.length - 1)).map((transition) => ({
      type: transition.type,
      durationFrames: Math.max(0, transition.durationFrames || 0),
    })),
    overlays: (c.overlays ?? []).map((overlay) => ({
      content: overlay.content,
      startFrame: Math.max(0, overlay.startFrame),
      endFrame: Math.max(overlay.startFrame + 1, overlay.endFrame),
      x: clamp01(overlay.x ?? 0.5),
      y: clamp01(overlay.y ?? 0.88),
      width: overlay.width ? clamp01(overlay.width) : undefined,
      fontSize: Math.max(12, overlay.fontSize ?? 52),
      color: overlay.color ?? "#ffffff",
      fontFamily: overlay.fontFamily ?? "Inter, Arial, sans-serif",
      fontWeight: overlay.fontWeight ?? "700",
      textAlign: overlay.textAlign ?? "center",
      letterSpacing: overlay.letterSpacing ?? 0,
      lineHeight: overlay.lineHeight ?? 1.12,
      backgroundColor: overlay.backgroundColor,
      padding: overlay.padding ?? 0,
      borderRadius: overlay.borderRadius ?? 0,
      opacity: overlay.opacity ?? 1,
      animation: overlay.animation,
    })),
    audio: {
      volume: c.audio?.volume ?? 1,
      fadeInFrames: c.audio?.fadeInFrames ?? 0,
      fadeOutFrames: c.audio?.fadeOutFrames ?? 0,
      muted: c.audio?.muted ?? false,
    },
    totalDurationFrames: c.totalDurationFrames || 1,
  };

  normalized.totalDurationFrames = getTimelineFrames(normalized);
  validateComposition(normalized);
  return normalized;
}

/** Compute total frames from clips and transitions. */
function getTimelineFrames(c: RemotionComposition) {
  const clipFrames = c.clips.map((clip) => {
    const seconds = Math.max(0.1, (clip.trimEnd ?? clip.duration) - (clip.trimStart ?? 0));
    return Math.max(1, Math.round((seconds * c.fps) / (clip.playbackRate ?? 1)));
  });
  const totalClipFrames = clipFrames.reduce((sum, frames) => sum + frames, 0);
  const overlapFrames = c.transitions.reduce((sum, transition) => sum + Math.max(0, transition.durationFrames), 0);
  return Math.max(1, totalClipFrames - overlapFrames);
}

/** Clamp a value into the 0-1 range. */
function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}
