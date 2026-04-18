/**
 * Edit route — accepts prompt + clips with thumbnails, generates a Remotion composition,
 * and auto-saves successful edits to the clip library.
 */
import { Router } from "express";
import { generateComposition } from "../services/glm";
import { embedText } from "../services/embedding";
import { clipStore } from "../services/clipStore";
import type { EditRequest, EditResponse } from "../types/remotion";

const router = Router();

router.post<{},{}, EditRequest>("/edit", async (req, res) => {
  const { prompt, clips } = req.body;

  if (!prompt?.trim()) {
    res.status(400).json({ success: false, error: "Prompt is required" } as EditResponse);
    return;
  }
  if (!clips || clips.length === 0) {
    res.status(400).json({ success: false, error: "At least one clip is required" } as EditResponse);
    return;
  }

  try {
    console.log(`Processing edit: ${clips.length} clips, prompt: "${prompt.slice(0, 50)}..."`);

    const composition = await generateComposition({ prompt, clips });

    // Auto-save to library — embedding failure must NOT block the edit response.
    let clipId: string | undefined;
    try {
      const embedding = await embedText(prompt);
      const fps = composition.fps || 30;
      const durationSeconds = Math.round(composition.totalDurationFrames / fps) || 30;
      const title = prompt.split(/[.!?]/)[0].trim().slice(0, 60) || "Untitled Clip";
      const saved = clipStore.saveClip({ prompt, title, embedding, composition, sourceVideoUrl: "", durationSeconds });
      clipId = saved.id;
    } catch (embedErr: any) {
      console.warn("[Edit] Library save skipped:", embedErr.message);
    }

    console.log(`Composition generated: ${composition.clips.length} clips, ${composition.overlays.length} overlays`);
    res.json({ success: true, composition, clipId } as EditResponse);
  } catch (err: any) {
    console.error("Edit generation failed:", err.message);
    res.status(500).json({ success: false, error: err.message } as EditResponse);
  }
});

export default router;
