/**
 * Clip library routes — save, list, and search clips
 */
import { Router } from "express";
import { embedText } from "../services/embedding";
import { clipStore } from "../services/clipStore";
import type { SaveClipRequest, SaveClipResponse, SearchClipsRequest, SearchClipsResponse } from "../types/clip";

const router = Router();

/** POST /clips — save a new clip with embedded prompt */
router.post<{}, {}, SaveClipRequest>("/clips", async (req, res) => {
  const { prompt, composition, sourceVideoUrl, durationSeconds } = req.body;

  if (!prompt?.trim()) {
    res.status(400).json({ success: false, error: "prompt is required" } as SaveClipResponse);
    return;
  }
  if (!composition) {
    res.status(400).json({ success: false, error: "composition is required" } as SaveClipResponse);
    return;
  }

  try {
    const embedding = await embedText(prompt);
    // Derive duration from composition if not provided, default 30s
    const fps = composition.fps || 30;
    const duration = durationSeconds ?? (Math.round(composition.totalDurationFrames / fps) || 30);
    // Use first sentence of prompt as title
    const title = prompt.split(/[.!?]/)[0].trim().slice(0, 60) || "Untitled Clip";

    const clip = clipStore.saveClip({ prompt, title, embedding, composition, sourceVideoUrl: sourceVideoUrl ?? "", durationSeconds: duration });
    res.status(201).json({ success: true, clip } as SaveClipResponse);
  } catch (err: any) {
    console.error("[Clips] Save failed:", err.message);
    res.status(500).json({ success: false, error: err.message } as SaveClipResponse);
  }
});

/** GET /clips — list all saved clips, newest first */
router.get("/clips", (_req, res) => {
  const clips = clipStore.getAllClips();
  res.json({ success: true, clips });
});

/** GET /clips/:id — retrieve a single clip by id */
router.get("/clips/:id", (req, res) => {
  const clip = clipStore.getClipById(req.params.id);
  if (!clip) {
    res.status(404).json({ success: false, error: "Clip not found" });
    return;
  }
  res.json({ success: true, clip });
});

/** DELETE /clips/:id — remove a clip from the library */
router.delete("/clips/:id", (req, res) => {
  const deleted = clipStore.deleteClip(req.params.id);
  if (!deleted) {
    res.status(404).json({ success: false, error: "Clip not found" });
    return;
  }
  res.json({ success: true });
});

/** POST /clips/search — semantic search by query text */
router.post<{}, {}, SearchClipsRequest>("/clips/search", async (req, res) => {
  const { query, limit = 10 } = req.body;

  if (!query?.trim()) {
    res.status(400).json({ success: false, error: "query is required" } as SearchClipsResponse);
    return;
  }

  try {
    const queryEmbedding = await embedText(query);
    const results = clipStore.searchByEmbedding(queryEmbedding, limit);
    res.json({ success: true, results } as SearchClipsResponse);
  } catch (err: any) {
    console.error("[Clips] Search failed:", err.message);
    res.status(500).json({ success: false, error: err.message } as SearchClipsResponse);
  }
});

export default router;
