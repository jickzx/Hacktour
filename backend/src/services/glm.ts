/**
 * Composition service — two-step pipeline using Gemini:
 * Step 1: Gemini Flash analyzes video thumbnails to understand content.
 * Step 2: Gemini Flash uses that context to generate a Remotion composition JSON.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { RemotionComposition, EditRequest } from "../types/remotion";

function getGemini() {
  if (!process.env.GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");
  const model = process.env.GEMINI_MODEL ?? "gemini-3.1-flash";
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model });
}

const VISION_SYSTEM_PROMPT = `You are a video analysis AI. You will be given thumbnail images from video clips along with their filenames and durations.

Analyze each thumbnail and describe what you see. Focus on:
- Scene type (indoor, outdoor, studio, etc.)
- Subjects (people, objects, text on screen)
- Action (talking, moving, static)
- Visual style (dark, bright, colorful, moody)
- Any text or graphics visible

Return a concise analysis for each clip. Keep it brief but descriptive.`;

const REMOTION_SYSTEM_PROMPT = `You are a video editing AI that outputs Remotion compositions as JSON.

You will receive:
1. Video context analysis from thumbnail inspection
2. The user's editing instructions
3. A VIDEO TRANSCRIPT with timed segments (if available) — use these to create subtitle overlays

Return a valid JSON object matching this exact schema:

{
  "fps": 30,
  "width": 1080,
  "height": 1920,
  "clips": [{ "id": "string", "name": "string", "duration": number_seconds, "trimStart": 0, "trimEnd": number_seconds }],
  "transitions": [{ "type": "fade|slide|wipe|zoom|dissolve", "durationFrames": number }],
  "overlays": [{ "content": "text", "startFrame": number, "endFrame": number, "x": 0.5, "y": 0.9, "fontSize": 52, "color": "#ffffff" }],
  "audio": { "volume": 0.8, "fadeInFrames": 30, "fadeOutFrames": 30 },
  "totalDurationFrames": number
}

CRITICAL RULES:
- If the prompt mentions "subtitles" and a VIDEO TRANSCRIPT is provided, you MUST create one overlay entry per transcript segment. Convert startSec to startFrame (startSec * fps) and endSec to endFrame (endSec * fps).
- Subtitle overlays: x=0.5, y=0.9, fontSize=52, color="#ffffff"
- If no transcript but subtitles requested, create placeholder subtitle overlays every 3 seconds
- x and y for overlays are normalized 0-1 (0.5 = centered, 0.9 = near bottom)
- totalDurationFrames = clip duration in seconds * fps
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

  const result = await getGemini().generateContent(parts);
  return result.response.text().trim() || "No context available";
}

async function generateRemotionComposition(
  context: string,
  request: EditRequest
): Promise<RemotionComposition> {
  const userMessage = `${REMOTION_SYSTEM_PROMPT}\n\nVideo Context Analysis:\n${context}\n\nClips:\n${request.clips.map((c) => `- ${c.name} (${c.duration}s)`).join("\n")}\n\nEdit instructions: ${request.prompt}`;

  const result = await getGemini().generateContent(userMessage);
  const rawContent = result.response.text().trim();

  const jsonStr = rawContent
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```$/m, "")
    .trim();

  const composition: RemotionComposition = JSON.parse(jsonStr);
  validateComposition(composition);
  return composition;
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
