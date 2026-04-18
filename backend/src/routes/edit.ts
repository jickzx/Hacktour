/**
 * Edit route — accepts prompt + clips, returns a Remotion composition via GLM 5.1
 */
import { Router } from "express";
import { generateComposition } from "../services/glm";
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
    const composition = await generateComposition({ prompt, clips });
    res.json({ success: true, composition } as EditResponse);
  } catch (err: any) {
    console.error("Edit generation failed:", err.message);
    res.status(500).json({ success: false, error: err.message } as EditResponse);
  }
});

export default router;
