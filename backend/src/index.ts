/**
 * Hacktour backend — health, edit API (GLM), and live stream analysis
 * Video transcription: Gemini (multimodal video+audio)
 * Comment generation: z.ai GLM (OpenAI-compatible)
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import editRouter from "./routes/edit";
import clipsRouter from "./routes/clips";

const app = express();
const PORT = process.env.PORT || 3001;

// Gemini — video+audio transcription
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const gemini = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

// z.ai GLM — comment/reaction generation
const zai = new OpenAI({
  apiKey: process.env.ZAI_API_KEY!,
  baseURL: process.env.ZAI_BASE_URL!,
});
const ZAI_MODEL = process.env.ZAI_MODEL ?? "glm-4.6v";

const upload = multer({ dest: "/tmp/hacktour-uploads/" });

app.use(cors());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", express.json({ limit: "1mb" }), editRouter);
app.use("/api", express.json({ limit: "1mb" }), clipsRouter);

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

  console.log(`[Analyse] ${(req.file.size / 1024).toFixed(1)}KB, context: ${context.length}`);

  try {
    // ── Step 1: Transcribe video+audio via Gemini ──
    const base64 = fs.readFileSync(filePath).toString("base64");

    const txResult = await gemini.generateContent([
      { inlineData: { mimeType: "video/quicktime", data: base64 } },
      `Analyse this live stream video clip.
Return a single natural description:
1. What the streamer is SAYING (transcribe verbatim if possible)
2. What is VISUALLY notable (briefly)
No labels. No JSON. Under 2 sentences.`,
    ]);

    const transcript = txResult.response.text().trim();
    console.log(`[Transcript] ${transcript}`);

    // ── Step 2: Generate viewer reactions via z.ai GLM ──
    const recentContext = context.join(" ... ");

    const reactResult = await zai.chat.completions.create({
      model: ZAI_MODEL,
      messages: [
        {
          role: "system",
          content: "You simulate live stream chat viewers reacting in real time. Return ONLY a valid JSON array, no markdown, no explanation.",
        },
        {
          role: "user",
          content: `Recent stream context: "${recentContext}"
What just happened: "${transcript}"

Generate 4-7 short authentic viewer chat comments reacting SPECIFICALLY to this.
Rules:
- Reference actual words/topics/visuals
- SHORT (1-8 words), like real live chat
- Mix: hype, questions, jokes, emojis
- Varied case (caps, lowercase, emoji-only)
- Realistic usernames (numbers, underscores)

[{"user":"name","text":"comment","avatar":"emoji"},...]`,
        },
      ],
      temperature: 0.9,
    });

    const raw = (reactResult.choices[0].message.content ?? "")
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let comments: unknown[] = [];
    try { comments = JSON.parse(raw); } catch { console.warn("[React] JSON parse failed:", raw.slice(0, 200)); }

    console.log(`[React] ${comments.length} comments via z.ai`);
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
