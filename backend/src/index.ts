/**
 * Hacktour backend — health, edit API (GLM), and live stream analysis (Gemini)
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import editRouter from "./routes/edit";

const app = express();
const PORT = process.env.PORT || 3001;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

const upload = multer({ dest: "/tmp/hacktour-uploads/" });

app.use(cors());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", express.json({ limit: "1mb" }), editRouter);

/**
 * POST /api/analyse
 * multipart/form-data: { video: .mov, context: JSON string[] }
 * Returns: { transcript: string, comments: Array<{user,text,avatar}> }
 */
app.post("/api/analyse", upload.single("video"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No video file uploaded" });
    return;
  }

  const filePath = req.file.path;
  let context: string[] = [];
  try { context = JSON.parse(req.body.context ?? "[]"); } catch {}

  console.log(`[Analyse] Received ${(req.file.size / 1024).toFixed(1)}KB, context: ${context.length} entries`);

  try {
    const base64 = fs.readFileSync(filePath).toString("base64");

    const txResult = await model.generateContent([
      { inlineData: { mimeType: "video/quicktime", data: base64 } },
      `Analyse this live stream video clip.
Return a single natural sentence describing:
1. What the streamer is SAYING (transcribe their speech verbatim if possible)
2. What is VISUALLY notable (briefly)
No labels. No JSON. Just the description. Under 2 sentences.`,
    ]);

    const transcript = txResult.response.text().trim();
    console.log(`[Transcript] ${transcript}`);

    const recentContext = context.join(" ... ");
    const reactResult = await model.generateContent(`You are simulating live stream chat viewers reacting in real time.

Recent stream: "${recentContext}"
What just happened: "${transcript}"

Generate 4-7 short authentic viewer chat comments reacting SPECIFICALLY to this.
Rules:
- Reference actual words/topics/visuals from the description
- SHORT (1-8 words), like real live chat
- Mix: hype, questions, jokes, emojis, agreements
- Varied case styles (caps, lowercase, emoji-only)
- Realistic usernames (numbers, underscores)
- Return ONLY valid JSON array, no markdown

[{"user":"name","text":"comment","avatar":"emoji"},...]`);

    const raw = reactResult.response.text().trim()
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let comments: unknown[] = [];
    try { comments = JSON.parse(raw); } catch { console.warn("[React] JSON parse failed:", raw.slice(0, 100)); }

    console.log(`[React] ${comments.length} comments generated`);
    res.json({ transcript, comments });

  } catch (err) {
    console.error("[Analyse] Error:", err);
    res.status(500).json({ error: "Analysis failed", detail: String(err) });
  } finally {
    try { fs.unlinkSync(filePath); } catch {}
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
