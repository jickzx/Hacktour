/**
 * POST /api/process
 * Accepts actual video file(s) + prompt, generates AI composition,
 * renders with Remotion, and returns a URL to the processed video.
 *
 * multipart/form-data:
 *   videos[]       — one or more .mp4/.mov video files
 *   prompt         — edit instructions string
 *   clipsMetadata  — JSON array of { name, duration, thumbnail? } (one per video, same order)
 */
import { Router } from "express";
import multer from "multer";
import fs from "fs";
import crypto from "crypto";
import { generateComposition } from "../services/glm";
import { extractThumbnail } from "../services/videoProcessor";
import { embedText } from "../services/embedding";
import { clipStore } from "../services/clipStore";
import { ensureRenderDirs, renderRemotionVideo, stageMediaFiles } from "../services/remotionRenderer";
import {
  transcribeClipFile,
  projectTranscriptsToOverlays,
  probeVideoDurationSeconds,
  type SourceTranscript,
} from "../services/transcript";

const router = Router();
const upload = multer({ dest: "/tmp/hacktour-uploads/" });

ensureRenderDirs();

router.post("/process", upload.array("videos"), async (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined;

  if (!files || files.length === 0) {
    res.status(400).json({ success: false, error: "No video files uploaded" });
    return;
  }

  const prompt: string = req.body.prompt ?? "";
  if (!prompt.trim()) {
    res.status(400).json({ success: false, error: "Prompt is required" });
    return;
  }

  let clipsMetadata: { name: string; duration: number; thumbnail?: string; trimStart?: number; trimEnd?: number }[] = [];
  try {
    clipsMetadata = JSON.parse(req.body.clipsMetadata ?? "[]");
  } catch {
    // fall back to empty metadata — AI will use clip names only
  }

  // Ensure metadata array matches files array length
  const clips = files.map((f, i) => ({
    name: clipsMetadata[i]?.name ?? f.originalname ?? `clip_${i + 1}.mp4`,
    duration: clipsMetadata[i]?.duration ?? 0,
    thumbnail: clipsMetadata[i]?.thumbnail,
    trimStart: clipsMetadata[i]?.trimStart,
    trimEnd: clipsMetadata[i]?.trimEnd,
  }));

  const inputPaths = files.map((f) => f.path);
  const jobId = crypto.randomUUID();
  let cleanupStagedMedia = () => {};

  console.log(`[Process] Job ${jobId}: ${files.length} clip(s), prompt: "${prompt.slice(0, 60)}"`);

  try {
    // Step 1: AI generates composition plan (structure, transitions, audio — NOT subtitles)
    //         We need the comp BEFORE we project subtitles so we know trims/rates/offsets.
    console.log("[Process] Generating composition...");
    const composition = await generateComposition({ prompt, clips });
    console.log(`[Process] Composition: ${composition.clips.length} clips, ${composition.overlays.length} overlays, ${composition.transitions.length} transitions`);

    // Step 2: Transcribe *every* uploaded source clip in parallel.
    //         Each source carries its own seconds-based segments — we'll project them
    //         into the comp timeline after, accounting for trim + playbackRate + offset.
    const wantsSubtitles = /subtitle|caption/i.test(prompt);
    let sourceTranscripts: SourceTranscript[] = [];
    if (wantsSubtitles && process.env.GEMINI_API_KEY) {
      console.log(`[Process] Transcribing ${files.length} source clip(s) in parallel…`);
      sourceTranscripts = await Promise.all(
        files.map(async (file, i) => {
          const mime = (file.originalname ?? "").toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4";
          const segments = await transcribeClipFile(file.path, mime);
          console.log(`[Process]   ${clips[i].name}: ${segments.length} segments`);
          return { name: clips[i].name, segments };
        })
      );
    }

    // Inject explicit trimStart/trimEnd from client metadata (overrides AI guess)
    clips.forEach((meta, i) => {
      if (composition.clips[i]) {
        if (meta.trimStart !== undefined) composition.clips[i].trimStart = meta.trimStart;
        if (meta.trimEnd !== undefined) composition.clips[i].trimEnd = meta.trimEnd;
      }
    });

    // Step 3: Project source-seconds segments onto the comp timeline.
    //         Replaces any AI-generated overlays when the user asked for subtitles.
    //         Runs AFTER trim overrides so projection uses the final trim window.
    if (wantsSubtitles && sourceTranscripts.some((s) => s.segments.length > 0)) {
      const projected = projectTranscriptsToOverlays(sourceTranscripts, composition);
      composition.overlays = projected;
      console.log(`[Process] Projected ${projected.length} subtitle overlays onto comp timeline`);
    }

    // Step 4: Remotion renders the final video from the JSON composition.
    console.log("[Process] Staging media for Remotion...");
    const staged = stageMediaFiles(files, jobId);
    cleanupStagedMedia = staged.cleanup;

    console.log("[Process] Rendering with Remotion...");
    const outputPath = await renderRemotionVideo(composition, staged.mediaClips, jobId);
    console.log(`[Process] Done → ${outputPath}`);

    // Step 5: Safety net — ffprobe the rendered file. If its real duration is shorter
    //         than the planned one (rare, but happens with certain codec edge cases),
    //         clamp any overlays that would paint past the real end.
    const realSeconds = probeVideoDurationSeconds(outputPath);
    if (realSeconds != null) {
      const plannedSeconds = composition.totalDurationFrames / composition.fps;
      if (realSeconds + 0.05 < plannedSeconds) {
        const realFrames = Math.floor(realSeconds * composition.fps);
        const before = composition.overlays.length;
        composition.overlays = composition.overlays
          .map((o) => ({ ...o, endFrame: Math.min(o.endFrame, realFrames) }))
          .filter((o) => o.endFrame > o.startFrame);
        console.log(`[Process] Render duration ${realSeconds.toFixed(2)}s < planned ${plannedSeconds.toFixed(2)}s — clamped overlays (${before}→${composition.overlays.length})`);
      }
    }

    const videoUrl = `/outputs/${jobId}.mp4`;

    // Step 3: Extract thumbnail from processed video
    let thumbnailUrl: string | undefined;
    try {
      await extractThumbnail(outputPath, jobId);
      thumbnailUrl = `/outputs/thumbs/${jobId}.jpg`;
    } catch (thumbErr: any) {
      console.warn("[Process] Thumbnail extraction failed:", thumbErr.message);
    }

    // Step 4: Auto-save to library (non-blocking)
    let clipId: string | undefined;
    try {
      const embedding = await embedText(prompt);
      const fps = composition.fps || 30;
      const durationSeconds = Math.round(composition.totalDurationFrames / fps) || 30;
      const title = prompt.split(/[.!?]/)[0].trim().slice(0, 60) || "Untitled Clip";
      const saved = clipStore.saveClip({ prompt, title, embedding, composition, sourceVideoUrl: videoUrl, thumbnailUrl, durationSeconds });
      clipId = saved.id;
    } catch (embedErr: any) {
      console.warn("[Process] Library save skipped:", embedErr.message);
    }

    // Outputs are kept indefinitely so library clips remain playable

    res.json({ success: true, videoUrl, composition, clipId });
  } catch (err: any) {
    console.error("[Process] Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    cleanupStagedMedia();

    // Always clean up uploaded input files
    for (const p of inputPaths) {
      try { fs.unlinkSync(p); } catch {}
    }
  }
});

export default router;
