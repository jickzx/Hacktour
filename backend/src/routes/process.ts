/**
 * POST /api/process
 * Accepts actual video file(s) + prompt, generates AI composition, runs ffmpeg,
 * returns a URL to the processed video.
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
import { processVideo, ensureOutputDir } from "../services/videoProcessor";
import { embedText } from "../services/embedding";
import { clipStore } from "../services/clipStore";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = Router();
const upload = multer({ dest: "/tmp/hacktour-uploads/" });

ensureOutputDir();

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

  let clipsMetadata: { name: string; duration: number; thumbnail?: string }[] = [];
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
  }));

  const inputPaths = files.map((f) => f.path);
  const jobId = crypto.randomUUID();

  console.log(`[Process] Job ${jobId}: ${files.length} clip(s), prompt: "${prompt.slice(0, 60)}"`);

  try {
    // Step 1: Transcribe the first video with Gemini to get speech for subtitles
    let transcript = "";
    try {
      if (process.env.GEMINI_API_KEY) {
        console.log("[Process] Transcribing audio...");
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const gemini = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });
        const base64 = fs.readFileSync(inputPaths[0]).toString("base64");
        const mimeType = files[0].originalname?.endsWith(".mov") ? "video/quicktime" : "video/mp4";
        const result = await gemini.generateContent([
          { inlineData: { mimeType, data: base64 } },
          `Transcribe EXACTLY what is spoken in this video. Return a JSON array of timed subtitle segments like:
[{"text":"Hello everyone","startSec":0.5,"endSec":2.1},{"text":"Welcome to my stream","startSec":2.3,"endSec":4.0}]
Each segment should be 3-8 words max for readable subtitles. Cover ALL speech. Return ONLY the JSON array, no markdown.`,
        ]);
        transcript = result.response.text().trim();
        console.log(`[Process] Transcript segments: ${transcript.slice(0, 200)}`);
      }
    } catch (txErr: any) {
      console.warn("[Process] Transcription failed, continuing without:", txErr.message);
    }

    // Parse transcript segments from Gemini's JSON response
    let transcriptSegments: { text: string; startSec: number; endSec: number }[] = [];
    if (transcript) {
      try {
        const arrMatch = transcript.match(/\[[\s\S]*\]/);
        transcriptSegments = JSON.parse(arrMatch?.[0] ?? "[]");
        console.log(`[Process] Parsed ${transcriptSegments.length} subtitle segments`);
      } catch {
        console.warn("[Process] Could not parse transcript JSON");
      }
    }

    // Step 2: AI generates composition plan (structure, transitions, audio — NOT subtitles)
    console.log("[Process] Generating composition...");
    const composition = await generateComposition({ prompt, clips });
    console.log(`[Process] Composition: ${composition.clips.length} clips, ${composition.overlays.length} overlays, ${composition.transitions.length} transitions`);

    // Step 3: Inject real subtitle overlays from transcript (overrides any AI-generated ones)
    if (transcriptSegments.length > 0 && /subtitle/i.test(prompt)) {
      const fps = composition.fps || 30;
      composition.overlays = transcriptSegments.map((seg) => ({
        content: seg.text,
        startFrame: Math.round(seg.startSec * fps),
        endFrame: Math.round(seg.endSec * fps),
        x: 0.5,
        y: 0.88,
        fontSize: 52,
        color: "#ffffff",
      }));
      console.log(`[Process] Injected ${composition.overlays.length} subtitle overlays from transcript`);
    }

    // Step 2: ffmpeg processes the video
    console.log("[Process] Running ffmpeg...");
    const outputPath = await processVideo(inputPaths, composition, jobId);
    console.log(`[Process] Done → ${outputPath}`);

    const videoUrl = `/outputs/${jobId}.mp4`;

    // Step 3: Auto-save to library (non-blocking)
    let clipId: string | undefined;
    try {
      const embedding = await embedText(prompt);
      const fps = composition.fps || 30;
      const durationSeconds = Math.round(composition.totalDurationFrames / fps) || 30;
      const title = prompt.split(/[.!?]/)[0].trim().slice(0, 60) || "Untitled Clip";
      const saved = clipStore.saveClip({ prompt, title, embedding, composition, sourceVideoUrl: videoUrl, durationSeconds });
      clipId = saved.id;
    } catch (embedErr: any) {
      console.warn("[Process] Library save skipped:", embedErr.message);
    }

    // Clean up processed output after 15 minutes
    setTimeout(() => { try { fs.unlinkSync(outputPath); } catch {} }, 15 * 60 * 1000);

    res.json({ success: true, videoUrl, composition, clipId });
  } catch (err: any) {
    console.error("[Process] Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    // Always clean up uploaded input files
    for (const p of inputPaths) {
      try { fs.unlinkSync(p); } catch {}
    }
  }
});

export default router;
