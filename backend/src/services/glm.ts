/**
 * GLM service — two-step pipeline:
 * Step 1: GLM 4.6V analyzes video thumbnails to understand content.
 * Step 2: GLM 5.1 uses that context to generate a Remotion composition JSON.
 */
import type { RemotionComposition, EditRequest } from "../types/remotion";

const GLM_API_URL = `${process.env.ZAI_BASE_URL ?? "https://api.z.ai/api/coding/paas/v4"}/chat/completions`;
/** System prompt for GLM 4.6V — extract video context from thumbnails */
const VISION_SYSTEM_PROMPT = `You are a video analysis AI. You will be given thumbnail images from video clips along with their filenames and durations.

Analyze each thumbnail and describe what you see. Focus on:
- Scene type (indoor, outdoor, studio, etc.)
- Subjects (people, objects, text on screen)
- Action (talking, moving, static)
- Visual style (dark, bright, colorful, moody)
- Any text or graphics visible

Return a concise analysis for each clip. Keep it brief but descriptive.`;

/** System prompt for GLM — generate Remotion composition from context */
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

/** Step 1: Analyze video thumbnails with GLM 4.6V */
async function analyzeVideoContext(request: EditRequest): Promise<string> {
  const apiKey = process.env.ZAI_API_KEY ?? process.env.GLM_API_KEY;
  if (!apiKey) throw new Error("ZAI_API_KEY not set");

  const clipsWithThumbs = request.clips.filter((c) => c.thumbnail).slice(0, 1);

  if (clipsWithThumbs.length === 0) {
    return "No thumbnails provided. Clip details:\n" +
      request.clips.map((c) => `- ${c.name} (${c.duration}s)`).join("\n");
  }

  // Build multimodal message content with thumbnails
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    {
      type: "text",
      text: `Analyze these video clip thumbnails:\n\n${request.clips.map((c) => `- ${c.name} (${c.duration}s)`).join("\n")}`,
    },
    ...clipsWithThumbs.map((c) => ({
      type: "image_url" as const,
      image_url: { url: c.thumbnail! },
    })),
  ];

  const res = await callGlm(apiKey, {
    model: process.env.ZAI_MODEL ?? "glm-4.6v",
    messages: [
      { role: "system", content: VISION_SYSTEM_PROMPT },
      { role: "user", content },
    ],
    temperature: 0.5,
    max_tokens: 512,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Vision API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "No context available";
}

/** Step 2: Generate Remotion composition with GLM 5.1 using video context */
async function generateRemotionComposition(
  context: string,
  request: EditRequest
): Promise<RemotionComposition> {
  const apiKey = process.env.ZAI_API_KEY ?? process.env.GLM_API_KEY;
  if (!apiKey) throw new Error("ZAI_API_KEY not set");

  const userMessage = `Video Context Analysis:\n${context}\n\nClips:\n${request.clips.map((c) => `- ${c.name} (${c.duration}s)`).join("\n")}\n\nEdit instructions: ${request.prompt}`;

  const res = await callGlm(apiKey, {
    model: process.env.ZAI_MODEL_CHAT ?? "glm-5-turbo",
    messages: [
      { role: "system", content: REMOTION_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0.3,
    max_tokens: 4000,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GLM API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const rawContent: string = data.choices?.[0]?.message?.content ?? "";

  const jsonStr = rawContent
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```$/m, "")
    .trim();

  const composition: RemotionComposition = JSON.parse(jsonStr);
  validateComposition(composition);
  return composition;
}

/** Full pipeline: analyze thumbnails then generate composition */
export async function generateComposition(
  request: EditRequest
): Promise<RemotionComposition> {
  let context = "";

  try {
    context = await analyzeVideoContext(request);
  } catch {
    context = "Thumbnail analysis unavailable. Use clip names, durations, and the user prompt only.";
  }

  return generateRemotionComposition(context, request);
}

async function callGlm(apiKey: string, body: object) {
  return fetch(GLM_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

/** Basic validation of required composition fields */
function validateComposition(c: RemotionComposition): void {
  if (!c.fps || !c.width || !c.height) {
    throw new Error("Composition missing required dimensions");
  }
  if (!Array.isArray(c.clips) || c.clips.length === 0) {
    throw new Error("Composition must have at least one clip");
  }
}
