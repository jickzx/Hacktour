/**
 * Photo library routes — upload, list, serve, and AI-edit photo files
 */
import { Router } from "express";
import multer from "multer";
import fs from "fs";
import { photoStore } from "../services/photoStore";
import { getGeminiModel } from "../services/modelConfig";

const router = Router();
const upload = multer({ dest: "/tmp/hacktour-photo-uploads/" });

const CINEMATIC_PROMPT =
  "Dont change the context of the photo, just make the composition more cinematic and better, keep the person the exact same, especially the face.";

/** POST /photos — upload a captured photo */
router.post("/photos", upload.single("photo"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, error: "No photo file" });
    return;
  }
  try {
    const buffer = fs.readFileSync(req.file.path);
    const caption = (req.body.caption as string | undefined) ?? "";
    const sessionId = (req.body.sessionId as string | undefined) ?? "unknown";
    const originalName = req.file.originalname ?? "photo.jpg";
    const ext = originalName.split(".").pop()?.toLowerCase() || "jpg";
    const photo = photoStore.savePhoto({ caption, sessionId, buffer, ext, variant: "original" });
    res.status(201).json({ success: true, photo });
  } catch (err: any) {
    console.error("[Photos] Save failed:", err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    try { fs.unlinkSync(req.file.path); } catch {}
  }
});

/** GET /photos — list all photos newest first */
router.get("/photos", (_req, res) => {
  res.json({ success: true, photos: photoStore.getAllPhotos() });
});

/** GET /photos/file/:filename — serve binary photo */
router.get("/photos/file/:filename", (req, res) => {
  const path = photoStore.getFilePath(req.params.filename);
  if (!fs.existsSync(path)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.sendFile(path);
});

/**
 * POST /photos/:id/edit — generate a cinematic edit of the given photo.
 * Uses Gemini image generation ("Nano Banana 2"). Saves the result as a new
 * photo entry with variant:"edited" and parentId pointing at the original.
 */
router.post("/photos/:id/edit", async (req, res) => {
  const parent = photoStore.getPhotoById(req.params.id);
  if (!parent) {
    res.status(404).json({ success: false, error: "Photo not found" });
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    res.status(500).json({ success: false, error: "Missing GEMINI_API_KEY" });
    return;
  }

  console.log(`[PhotoEdit] parent=${parent.id} model=imageEdit`);

  try {
    const inputBuffer = photoStore.readFileBuffer(parent.filename);
    const base64 = inputBuffer.toString("base64");
    const mimeType = parent.filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

    const result = await getGeminiModel("imageEdit").generateContent([
      { inlineData: { mimeType, data: base64 } },
      CINEMATIC_PROMPT,
    ]);

    // Image-gen responses come back as inlineData parts
    const parts = result.response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p: any) => p.inlineData?.data);
    if (!imagePart?.inlineData?.data) {
      console.warn("[PhotoEdit] Model returned no image. Parts:", JSON.stringify(parts).slice(0, 300));
      res.status(502).json({ success: false, error: "Image model returned no image" });
      return;
    }

    const editedBuffer = Buffer.from(imagePart.inlineData.data, "base64");
    const editedExt = (imagePart.inlineData.mimeType ?? "image/jpeg").includes("png") ? "png" : "jpg";

    const edited = photoStore.savePhoto({
      caption: parent.caption ? `${parent.caption} (cinematic)` : "cinematic",
      sessionId: parent.sessionId,
      buffer: editedBuffer,
      ext: editedExt,
      variant: "edited",
      parentId: parent.id,
    });

    res.status(201).json({ success: true, photo: edited });
  } catch (err: any) {
    console.error("[PhotoEdit] Error:", err?.message || err);
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

export default router;
