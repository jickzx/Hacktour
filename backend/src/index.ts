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
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import editRouter from "./routes/edit";
import clipsRouter from "./routes/clips";

const app = express();
const PORT = process.env.PORT || 3001;

const ZAI_MODEL = process.env.ZAI_MODEL ?? "glm-4.6v";
const ZAI_MODEL_CHAT = process.env.ZAI_MODEL_CHAT ?? "glm-5-turbo";
const upload = multer({ dest: "/tmp/hacktour-uploads/" });

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", editRouter);
app.use("/api", clipsRouter);

/** Creates a Gemini client only when the key is configured. */
function getGeminiModel() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });
}

/** Creates a z.ai client only when the key is configured. */
function getZaiClient() {
  if (!process.env.ZAI_API_KEY || !process.env.ZAI_BASE_URL) {
    throw new Error("Missing ZAI_API_KEY or ZAI_BASE_URL");
  }

  return new OpenAI({
    apiKey: process.env.ZAI_API_KEY,
    baseURL: process.env.ZAI_BASE_URL,
  });
}

/**
 * POST /api/transcribe
 * multipart/form-data: { audio: .m4a }
 * Returns: { transcript: string }
 */
app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No audio file" });
    return;
  }

  const filePath = req.file.path;
  console.log(`[Transcribe] ${(req.file.size / 1024).toFixed(1)}KB`);

  try {
    const gemini = getGeminiModel();
    const base64 = fs.readFileSync(filePath).toString("base64");
    const result = await gemini.generateContent([
      { inlineData: { mimeType: "audio/m4a", data: base64 } },
      "Transcribe exactly what is spoken in this audio clip. Return only the spoken words verbatim, nothing else. If nothing is spoken return empty string.",
    ]);
    const transcript = result.response.text().trim();
    console.log(`[Transcribe] "${transcript}"`);
    res.json({ transcript });
  } catch (err) {
    console.error("[Transcribe] Error:", err);
    res.status(500).json({ error: "Transcription failed", detail: String(err) });
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
});

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
  try {
    context = JSON.parse(req.body.context ?? "[]");
  } catch {}

  console.log(`[Analyse] ${(req.file.size / 1024).toFixed(1)}KB, context: ${context.length}`);

  try {
    const gemini = getGeminiModel();
    const zai = getZaiClient();
    const base64 = fs.readFileSync(filePath).toString("base64");
    const recentContext = context.join(" ... ");

    const [txResult, preReactResult] = await Promise.all([
      gemini.generateContent([
        { inlineData: { mimeType: "video/quicktime", data: base64 } },
        "Transcribe EXACTLY what the person is saying in this video clip. verbatim speech only — no descriptions, no labels, no context. If nothing is said, return empty string.",
      ]),
      zai.chat.completions.create({
        model: ZAI_MODEL,
        messages: [
          {
            role: "system",
            content: "You simulate live stream chat viewers reacting in real time. Return ONLY a valid JSON array, no markdown, no explanation.",
          },
          {
            role: "user",
            content: `Recent stream context: "${recentContext}"

Generate 4-6 short authentic viewer chat comments for a live stream.
Rules:
- SHORT (1-8 words), like real live chat
- Mix: hype, questions, jokes, emojis
- Varied case (caps, lowercase, emoji-only)
- Realistic usernames (numbers, underscores)

[{"user":"name","text":"comment","avatar":"emoji"},...]`,
          },
        ],
        temperature: 0.9,
      }),
    ]);

    const transcript = txResult.response.text().trim();
    console.log(`[Transcript] ${transcript}`);

    const reactRaw = preReactResult.choices[0].message.content ?? "";
    const arrMatch = reactRaw.match(/\[[\s\S]*\]/);
    let comments: unknown[] = [];
    try {
      comments = JSON.parse(arrMatch?.[0] ?? "[]");
    } catch {
      console.warn("[React] JSON parse failed:", reactRaw.slice(0, 200));
    }

    console.log(`[React] ${comments.length} comments via z.ai`);
    res.json({ transcript, comments });
  } catch (err) {
    console.error("[Analyse] Error:", err);
    res.status(500).json({ error: "Analysis failed", detail: String(err) });
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
});

/**
 * POST /api/assistant
 * Body: { command: string, context: string[] }
 * Returns: { response: string, action?: { type: string, [key: string]: any } }
 */
app.post("/api/assistant", express.json(), async (req, res) => {
  const { command, context = [], pollOnly = false } = req.body as {
    command?: string;
    context?: string[];
    pollOnly?: boolean;
  };

  if (!command?.trim()) {
    res.status(400).json({ error: "Missing command" });
    return;
  }

  console.log(`[Assistant] Command: "${command}"${pollOnly ? " (pollOnly)" : ""}`);

  const systemPrompt = pollOnly
    ? `You are a poll detector. Your ONLY job is to find "X or Y" choices in streamer speech.

TRIGGER a poll for ANY of these patterns:
- "X or Y?" — "KFC or McDonald's", "cats or dogs", "iOS or Android"
- "who's gonna win, X or Y" — "who's gonna win, Lacey or Marlon"
- "X or Y, which one" — any choice between two named things
- "vote: X or Y", "chat: X or Y"
- Comparing two teams, people, foods, games, anything

BE AGGRESSIVE. If there are two nouns separated by "or", it's probably a poll. DO NOT overthink it.

If poll detected, respond with ONLY this exact JSON (no markdown, no extra text):
{"action":{"type":"create_poll","poll":{"question":"<the question>","options":["<option A>","<option B>"]}}}

If absolutely no choice/comparison present, respond with ONLY:
{"action":{"type":"none"}}`
    : `You are "Zee", a smart voice assistant built into a live streaming app called Stream Mind.
The app has 3 tabs: home, edit (AI video editor), live (live streaming).
While live streaming you can: go_live, end_stream, mute, unmute, flip_camera.
You can also create polls when the streamer mentions a choice between things (e.g. "KFC or McDonald's", "iOS or Android", "cats or dogs").
You have a fun, energetic, streamer-friendly personality. Keep responses short (1-2 sentences max).

Always respond with valid JSON only — no markdown:
{"response":"what you say back","action":{"type":"action_type"}}

Action types:
- navigate_tab → include "tab":"home"|"edit"|"live"
- go_live, end_stream, mute, unmute, flip_camera
- create_poll → include "poll":{"question":"Which do you prefer?","options":["Option A","Option B"]}
- none

If you detect the streamer is asking chat to choose between things, use create_poll automatically.
If no action needed use {"type":"none"}.`;

  try {
    const zai = getZaiClient();
    const result = await zai.chat.completions.create({
      model: ZAI_MODEL_CHAT,
      temperature: pollOnly ? 0 : 0.8,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        ...(!pollOnly && context.length
          ? [
              {
                role: "user" as const,
                content: `Recent stream context: ${context.slice(-3).join(" | ")}`,
              },
            ]
          : []),
        {
          role: "user",
          content: command,
        },
      ],
    });

    const assistRaw = result.choices[0].message.content ?? "";
    const objMatch = assistRaw.match(/\{[\s\S]*\}/);
    let parsed: { response: string; action?: Record<string, unknown> } = {
      response: "Got it!",
      action: { type: "none" },
    };
    try {
      parsed = JSON.parse(objMatch?.[0] ?? "{}");
    } catch {
      console.warn("[Assistant] JSON parse failed:", assistRaw.slice(0, 200));
    }

    console.log(`[Assistant] Response: "${parsed.response}", Action: ${JSON.stringify(parsed.action)}`);
    res.json(parsed);
  } catch (err) {
    console.error("[Assistant] Error:", err);
    res.status(500).json({ error: "Assistant failed", detail: String(err) });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/live" });

const GEMINI_LIVE_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`;

wss.on("connection", (client) => {
  console.log("[Live] Client connected");

  const geminiWs = new WebSocket(GEMINI_LIVE_URL);
  let ready = false;
  const queue: string[] = [];

  geminiWs.on("open", () => {
    const setup = {
      setup: {
        model: "models/gemini-live-2.5-flash",
        generationConfig: {
          responseModalities: ["TEXT"],
          inputAudioTranscription: {},
        },
        systemInstruction: {
          parts: [{ text: "Transcribe speech from this live stream audio. Return only the spoken words, nothing else." }],
        },
      },
    };
    geminiWs.send(JSON.stringify(setup));
  });

  geminiWs.on("message", (data) => {
    const msg = JSON.parse(data.toString());

    if (msg.setupComplete) {
      console.log("[Live] Gemini setup complete");
      ready = true;
      queue.forEach((m) => geminiWs.send(m));
      queue.length = 0;
      client.send(JSON.stringify({ type: "ready" }));
      return;
    }

    if (msg.inputTranscription?.text) {
      client.send(JSON.stringify({ type: "transcript", text: msg.inputTranscription.text }));
    }
  });

  geminiWs.on("error", (err) => {
    console.error("[Live] Gemini WS error:", err.message);
    client.send(JSON.stringify({ type: "error", message: err.message }));
  });

  geminiWs.on("close", () => {
    console.log("[Live] Gemini WS closed");
    if (client.readyState === WebSocket.OPEN) {
      client.close();
    }
  });

  client.on("message", (data) => {
    const msg = JSON.parse(data.toString()) as { audio: string };
    const payload = JSON.stringify({
      realtimeInput: {
        audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" },
      },
    });
    if (ready && geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.send(payload);
    } else {
      queue.push(payload);
    }
  });

  client.on("close", () => {
    console.log("[Live] Client disconnected");
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.close();
    }
  });
});

server.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
