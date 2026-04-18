/**
 * GLM 5.1 API client — sends prompts to ZhipuAI and returns Remotion compositions
 */
import type { RemotionComposition, EditRequest } from "../types/remotion";

const GLM_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

/** System prompt that instructs GLM to output valid Remotion JSON */
const SYSTEM_PROMPT = `You are a video editing AI that outputs Remotion compositions as JSON.

Given a user prompt describing how they want their video edited and a list of clips, you must return a valid JSON object matching this exact schema:

{
  "fps": 30,
  "width": 1080,
  "height": 1920,
  "clips": [{ "id": "string", "name": "string", "duration": number_seconds, "trimStart": 0, "trimEnd": number_seconds }],
  "transitions": [{ "type": "fade|slide|wipe|zoom|dissolve", "durationFrames": number }],
  "overlays": [{ "content": "text", "startFrame": number, "endFrame": number, "x": 0.5, "y": 0.5, "fontSize": 48, "color": "#ffffff" }],
  "audio": { "volume": 0.8, "fadeInFrames": 30, "fadeOutFrames": 30 },
  "totalDurationFrames": number
}

Rules:
- x and y for overlays are normalized 0-1 (proportional position)
- durationFrames is in frames at the given fps
- Include transitions between clips as appropriate
- Add overlays for subtitles, titles, or text the user requests
- totalDurationFrames = sum of all clip durations * fps
- Return ONLY the JSON object, no markdown fences, no explanation
- Be creative with transitions and effects based on the user's prompt`;

/** Calls GLM 5.1 with the edit request and returns a parsed Remotion composition */
export async function generateComposition(
  request: EditRequest
): Promise<RemotionComposition> {
  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) throw new Error("GLM_API_KEY not set in environment");

  const userMessage = `Clips:\n${request.clips.map((c) => `- ${c.name} (${c.duration}s)`).join("\n")}\n\nEdit instructions: ${request.prompt}`;

  const res = await fetch(GLM_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "glm-5.1",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GLM API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const rawContent: string = data.choices?.[0]?.message?.content ?? "";

  // Strip markdown code fences if present
  const jsonStr = rawContent
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```$/m, "")
    .trim();

  const composition: RemotionComposition = JSON.parse(jsonStr);
  validateComposition(composition);
  return composition;
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
