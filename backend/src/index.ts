/**
 * Hacktour backend — health, edit API, and live stream analysis
 * All AI: Gemini (transcription, comment generation, assistant)
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import http from "http";
import os from "os";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI } from "@google/genai";
import editRouter from "./routes/edit";
import clipsRouter from "./routes/clips";
import processRouter from "./routes/process";
import youtubeRouter from "./routes/youtube";
import feedRouter from "./routes/feed";
import photosRouter from "./routes/photos";
import { GEMINI_MODELS, getGeminiModel } from "./services/modelConfig";
import { lookupProduct } from "./services/productLookup";

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "0.0.0.0";
const liveTokenClient = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, apiVersion: "v1alpha" })
  : null;

/**
 * Find the current LAN URLs so local devices can reach the backend.
 */
function getServerUrls(port: string | number): string[] {
  const urls = new Set([`http://localhost:${port}`]);

  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        urls.add(`http://${address.address}:${port}`);
      }
    }
  }

  return [...urls];
}

const upload = multer({ dest: "/tmp/hacktour-uploads/" });

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use("/media", express.static("/tmp/hacktour-media/"));
app.use("/outputs", express.static("/tmp/hacktour-outputs/"));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", editRouter);
app.use("/api", clipsRouter);
app.use("/api", processRouter);
app.use("/api", youtubeRouter);
app.use("/api", photosRouter);
app.use("/api", feedRouter);

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
  const inputMimeType = getUploadAudioMimeType(req.file);
  console.log(`[Transcribe] ${(req.file.size / 1024).toFixed(1)}KB`);

  try {
    const base64 = fs.readFileSync(filePath).toString("base64");
    const result = await getGeminiModel("transcription").generateContent([
      { inlineData: { mimeType: inputMimeType, data: base64 } },
      `Transcribe only clearly audible human speech from this audio clip.

Rules:
- Return valid JSON only, no markdown.
- If the clip is silence, noise, music, rustling, crowd sound, or unclear mumbling, return {"transcript":"","shouldPublish":false}.
- If speech is partial or too uncertain to quote confidently, return {"transcript":"","shouldPublish":false}.
- Do not guess, summarize, paraphrase, clean up, or invent words.
- Do not include speaker labels.
- Only set shouldPublish=true when the spoken words are clear enough to quote in a live chat transcript.

Format:
{"transcript":"exact words here","shouldPublish":true}`,
    ]);
    const raw = result.response.text().trim();
    const objMatch = raw.match(/\{[\s\S]*\}/);
    let parsed: { transcript?: string; shouldPublish?: boolean } = {};
    try {
      parsed = JSON.parse(objMatch?.[0] ?? "{}");
    } catch {
      console.warn("[Transcribe] JSON parse failed:", raw.slice(0, 200));
    }

    // Fall back to plain text if Gemini ignored the JSON shape but still returned a clean transcript.
    const plainTextFallback = !objMatch && !/[\[\]{}]/.test(raw)
      ? raw.replace(/^"|"$/g, "").trim()
      : "";
    const shouldPublish = parsed.shouldPublish ?? Boolean(plainTextFallback);
    const transcript = shouldPublish
      ? String(parsed.transcript ?? plainTextFallback ?? "").trim()
      : "";
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

/** Map uploaded audio metadata to a Gemini-friendly MIME type. */
function getUploadAudioMimeType(file: Express.Multer.File): string {
  const hintedType = file.mimetype?.trim().toLowerCase();
  if (hintedType && hintedType !== "application/octet-stream") return hintedType;

  const lowerName = file.originalname?.toLowerCase() ?? "";
  if (lowerName.endsWith(".caf")) return "audio/x-caf";
  if (lowerName.endsWith(".wav")) return "audio/wav";
  if (lowerName.endsWith(".webm")) return "audio/webm";
  if (lowerName.endsWith(".mp3")) return "audio/mpeg";
  return "audio/mp4";
}

/**
 * POST /api/analyse
 * multipart/form-data: { video: .mov, context: JSON string[] }
 * Returns: { transcript: string, comments: Array<{user,text,avatar}> }
 */
app.post("/api/analyse", upload.single("frame"), async (req, res) => {
  // Accept base64 directly from body, or fall back to uploaded file
  const base64: string = req.body.base64 ?? (req.file ? fs.readFileSync(req.file.path).toString("base64") : "");
  if (!base64) {
    res.status(400).json({ error: "No frame provided" });
    return;
  }

  let context: string[] = [];
  try {
    context = JSON.parse(req.body.context ?? "[]");
  } catch {}
  const emojiMode = req.body.emojiMode === "1";
  const clipMode = req.body.clipMode === "1";

  console.log(`[Analyse] frame ${(base64.length * 0.75 / 1024).toFixed(1)}KB, context: ${context.length}, clipMode: ${clipMode}`);

  try {
    const recentSpeech = context.join(" ... ");

    // ── Clip mode: just return a descriptive clip prompt ──────────────────────
    if (clipMode) {
      const clipRes = await getGeminiModel("assistant").generateContent([
        {
          text: `You are a video clip titler. Look at this livestream frame and the streamer's recent speech, then write a short, punchy clip prompt (5-12 words) that describes what to highlight.${recentSpeech ? `\n\nStreamer just said: "${recentSpeech}"` : ""}\n\nReturn ONLY the clip prompt text, nothing else.`,
        },
        { inlineData: { data: base64, mimeType: "image/jpeg" } },
      ]);
      const clipPrompt = clipRes.response.text().trim().replace(/^["']|["']$/g, "");
      console.log(`[Clip] Prompt: "${clipPrompt}"`);
      res.json({ clipPrompt });
      return;
    }

    const COMMENTS_SYSTEM = emojiMode
      ? `You are a Twitch/Kick chat viewer in EMOJI ONLY mode. React using ONLY emojis — no words. Return a JSON array of 3-5 objects: [{"user":"name","text":"🔥😂","avatar":"emoji"},...]`
      : `You are a hype Gen Z Twitch/Kick/Bilibili chat. Return ONLY a valid JSON array, no markdown.
Generate 3-5 short authentic viewer comments reacting to the scene and streamer speech.
Rules:
- SHORT (1-8 words) like real live chat
- Mix: hype, jokes, memes, questions, reactions, emojis
- Varied case (caps, lowercase, emoji-only)
- Realistic usernames with numbers/underscores
- 80% English, 20% Chinese Simplified slang (哇塞, 666, 太厉害了, 笑死我了, 牛啊, 绝了, 哈哈哈, nb)
- High energy — never repeat same comment
[{"user":"name","text":"comment","avatar":"emoji"},...]`;

    // Step 1: scene analysis with frame + transcript context
    const videoRes = await getGeminiModel("chat").generateContent([
      {
        text: `You are a real-time stream analyzer. Describe what is happening in 1-2 sentences. Focus on actions, objects, notable events.${recentSpeech ? `\n\nStreamer just said: "${recentSpeech}"` : ""}`,
      },
      { inlineData: { data: base64, mimeType: "image/jpeg" } },
    ]);
    const sceneAnalysis = videoRes.response.text().trim();
    console.log(`[Scene] ${sceneAnalysis.slice(0, 100)}`);

    // Step 2: comments using scene + transcript context
    const commentContext = [
      `Scene: ${sceneAnalysis}`,
      recentSpeech ? `IMPORTANT — streamer just said: "${recentSpeech}" — react to this directly` : "",
    ].filter(Boolean).join("\n");

    const reactResult = await getGeminiModel("chat").generateContent(`${COMMENTS_SYSTEM}\n\n${commentContext}`);
    const transcript = sceneAnalysis;
    const reactRaw = reactResult.response.text().trim();
    const arrMatch = reactRaw.match(/\[[\s\S]*\]/);
    let comments: unknown[] = [];
    try {
      comments = JSON.parse(arrMatch?.[0] ?? "[]");
    } catch {
      console.warn("[React] JSON parse failed:", reactRaw.slice(0, 200));
    }

    console.log(`[React] ${comments.length} comments via Gemini`);
    res.json({ transcript, comments });
  } catch (err) {
    console.error("[Analyse] Error:", err);
    res.status(500).json({ error: "Analysis failed", detail: String(err) });
  } finally {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
  }
});

/**
 * POST /api/clip-prompt
 * Body: { context: string[] }  — recent transcript lines
 * Returns: { clipPrompt: string }
 * Uses Gemini to write a punchy clip title based on what was just said.
 */
app.post("/api/clip-prompt", async (req, res) => {
  const context: string[] = req.body.context ?? [];
  const speech = context.join(" ").trim();
  try {
    const prompt = speech
      ? `Based on what the streamer just said, write a short punchy clip title (5-12 words) suitable for a highlight reel.\n\nStreamer said: "${speech}"\n\nReturn ONLY the clip title, no quotes, no explanation.`
      : `Write a short punchy generic livestream highlight title (5-10 words). Return ONLY the title.`;
    const result = await getGeminiModel("assistant").generateContent(prompt);
    const clipPrompt = result.response.text().trim().replace(/^["']|["']$/g, "");
    res.json({ clipPrompt });
  } catch (err) {
    console.warn("[clip-prompt] Gemini error:", err);
    res.json({ clipPrompt: speech || "Highlight this moment" });
  }
});

/**
 * POST /api/detect-poll
 * Body: { transcript: string }
 * Returns: { poll: { question, options } | null }
 * Uses Gemini function calling to detect if streamer is asking chat to vote.
 */
app.post("/api/detect-poll", async (req, res) => {
  const { transcript } = req.body as { transcript?: string };
  if (!transcript?.trim()) { res.json({ poll: null }); return; }

  // Fast regex gate — skip AI entirely if transcript has no poll-like keywords
  const looksLikePoll = /\bor\b|\bvs\.?\b|\bversus\b|\bwhich\b|\bshould i\b/i.test(transcript);
  if (!looksLikePoll) { res.json({ poll: null }); return; }

  try {
      const result = await getGeminiModel("assistant").generateContent({
      contents: [{ role: "user", parts: [{ text: `Streamer said: "${transcript}"\n\nOnly call create_poll if the streamer is DIRECTLY asking chat to choose between two specific named options (e.g. "McDonald's or KFC?", "cats or dogs?", "iOS or Android?"). The question must be explicit — not a statement, not rhetorical. If in any doubt, do NOT call create_poll.` }] }],
      tools: [{
        functionDeclarations: [{
          name: "create_poll",
          description: "Create a poll when the streamer asks chat to vote between two options",
          parameters: {
            type: "object",
            properties: {
              question: { type: "string", description: "The poll question" },
              optionA: { type: "string", description: "First option" },
              optionB: { type: "string", description: "Second option" },
            },
            required: ["question", "optionA", "optionB"],
          },
        }],
      }],
      toolConfig: { functionCallingConfig: { mode: "AUTO" as any } },
    } as any);

    const call = result.response.candidates?.[0]?.content?.parts
      ?.find((p: any) => p.functionCall?.name === "create_poll")?.functionCall;

    if (!call) { res.json({ poll: null }); return; }

    const args = call.args as { question: string; optionA: string; optionB: string };
    console.log(`[Poll] Detected: "${args.optionA}" vs "${args.optionB}"`);
    res.json({ poll: { question: args.question, options: [args.optionA, args.optionB] } });
  } catch (err) {
    console.error("[Poll] Error:", err);
    res.json({ poll: null });
  }
});

/**
 * POST /api/outfit
 * multipart/form-data: { photo: .jpg }
 * Returns: { items: Array<{ label: string, query: string, searchUrl: string }> }
 * Uses Gemini vision to identify clothing items and returns Google Shopping search links.
 */
app.post("/api/outfit", upload.single("photo"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No photo uploaded" });
    return;
  }

  const filePath = req.file.path;
  console.log(`[Outfit] ${(req.file.size / 1024).toFixed(1)}KB`);

  try {
    const base64 = fs.readFileSync(filePath).toString("base64");
    const mimeType = req.file.mimetype || "image/jpeg";

    const result = await getGeminiModel("defaultText").generateContent([
      { inlineData: { mimeType, data: base64 } },
      `Identify each distinct clothing, footwear, or accessory item the person in this image is wearing.
Return ONLY a JSON array, no markdown. Max 5 items, most prominent first.
Each item must be a short, specific shopping query (2-6 words) including colour + type + notable detail.

Format: [{"label":"short name","query":"specific search phrase"}]
Example: [{"label":"Black hoodie","query":"black oversized zip-up hoodie"},{"label":"White sneakers","query":"white chunky low-top sneakers"}]

If no person or clothing is visible, return [].`,
    ]);

    const raw = result.response.text();
    const arrMatch = raw.match(/\[[\s\S]*\]/);
    let parsed: { label: string; query: string }[] = [];
    try { parsed = JSON.parse(arrMatch?.[0] ?? "[]"); } catch {
      console.warn("[Outfit] JSON parse failed:", raw.slice(0, 200));
    }

    const items = parsed.slice(0, 5).map((it) => ({
      label: String(it.label ?? it.query ?? "item").slice(0, 40),
      query: String(it.query ?? it.label ?? "").slice(0, 80),
      searchUrl: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(String(it.query ?? it.label ?? ""))}`,
    }));

    console.log(`[Outfit] ${items.length} items`);
    res.json({ success: true, items });
  } catch (err) {
    console.error("[Outfit] Error:", err);
    res.status(500).json({ success: false, error: String(err) });
  } finally {
    try { fs.unlinkSync(filePath); } catch {}
  }
});

/**
 * POST /api/product-link
 * Body: { query: string }
 * Returns: { success: boolean, item?: { title, price?, store?, url, displayUrl, summary } }
 * Uses Gemini 3.0 Flash + Google Search grounding to find a buy link.
 */
app.post("/api/product-link", express.json(), async (req, res) => {
  const { query } = req.body as { query?: string };
  if (!query?.trim()) {
    res.status(400).json({ success: false, error: "Missing query" });
    return;
  }

  try {
    const item = await lookupProduct(query);
    if (!item) {
      res.status(404).json({ success: false, error: "No product found" });
      return;
    }

    console.log(`[ProductLookup] ${query} -> ${item.url}`);
    res.json({ success: true, item });
  } catch (err) {
    console.error("[ProductLookup] Error:", err);
    res.status(500).json({ success: false, error: String(err) });
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
    : `You are "Panda", a smart voice assistant built into a live streaming app called Stream Mind.
The app has 5 tabs: home, edit (AI video editor), live (live streaming), library, settings.
Inside the library there is an Images section where saved photos appear.
While live streaming you can control the stream with the commands listed below.
You can also create polls when the streamer mentions a choice between things (e.g. "KFC or McDonald's", "iOS or Android", "cats or dogs").
You can take a photo shoot of the streamer when they ask you to take pictures of them — you'll guide them through poses and the app will capture each one.
You have a fun, chill, streamer-friendly personality with panda energy. Keep responses short (1-2 sentences max).

Always respond with valid JSON only — no markdown:
{"response":"what you say back","action":{"type":"action_type"}}

Action types:
- navigate_tab → include "tab":"home"|"edit"|"live"|"library"
- go_live — start the stream
- end_stream — end the stream
- mute — mute mic
- unmute — unmute mic
- flip_camera — switch front/back camera
- create_poll → include "poll":{"question":"Which do you prefer?","options":["Option A","Option B"]}
- close_poll — dismiss the active poll
- emoji_mode — toggle emoji-only mode (Panda responds in emojis only, chat AI comments go emoji-only)
- hype — blast a wave of hype messages into chat
- shoutout → include "user":"<username>" to shout out a viewer (e.g. "panda shoutout xX_fan99")
- countdown → include "seconds":<number> (default 5) to start a countdown in chat
- pull_up_clip → include "query":"<search description>" — streamer wants to show a clip from their library on stream. Extract the descriptive part as the search query. Examples: "pull up the clip where I was cooking" → query:"cooking", "show that dancing clip" → query:"dancing", "play the intro video" → query:"intro video"
- pull_up_product → include "query":"<product search>" — streamer wants Panda to find a shopping page for a product and show it on stream. Examples: "pull up red nike air maxes" → query:"red nike air maxes", "panda show me black adidas sambas" → query:"black adidas sambas"
- clip — save a clip of the current live moment to the library
- take_photos → include "poses":["pose 1","pose 2",...] with 3-5 short pose prompts
- identify_outfit → no extra fields
- change_voice → include any useful combination of:
  - "preset":"default"|"chill"|"hype"|"deep"|"chipmunk"
  - "language":"en-US"|"en-GB"|"en-AU"|"es-ES"|"fr-FR"|"de-DE"|"ja-JP"
- none

If the streamer says anything like "take pictures of me", "take my photo", "photo shoot", "snap me", use take_photos with 3-5 fun, short pose instructions (e.g. "big smile", "look over your shoulder", "peace sign", "candid laugh").
If the streamer says anything like "what am I wearing", "rate my fit", "find my outfit", "where can I buy this", "link my clothes", "what's this shirt", use identify_outfit.
If the streamer asks to change Panda's voice, accent, speed, pitch, or vibe, use change_voice.
Use preset="chill" for softer/slower voice requests, preset="hype" for energetic/faster voice requests, preset="deep" for lower pitch requests, preset="chipmunk" for very high pitch requests, and language for accent/language requests.
If you detect the streamer is asking chat to choose between things, use create_poll automatically.
If the streamer says "pull up", "show", "play", or "find" followed by a clip description, use pull_up_clip with the descriptive part as the query.
If the streamer says "pull up", "show", "find", or "open" followed by a product, clothing item, shoe, brand item, or shopping request, use pull_up_product with the product phrase as the query.
If the streamer says "clip this", "clip that", "save this", "clip it", "record that", "save a clip", use clip.
If no action needed use {"type":"none"}.`;

  try {
    const fullPrompt = [
      systemPrompt,
      ...(!pollOnly && context.length ? [`Recent stream context: ${context.slice(-3).join(" | ")}`] : []),
      command,
    ].join("\n\n");

    const result = await getGeminiModel("assistant").generateContent(fullPrompt);
    const assistRaw = result.response.text().trim();
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

/**
 * POST /api/copilot
 * Body: { messages: string[], transcript: string[] }
 * Returns: { suggestedReply: string, chatSummary: string, modAlert: string | null }
 */
app.post("/api/copilot", async (req, res) => {
  const { messages = [], transcript = [] } = req.body as { messages?: string[]; transcript?: string[] };

  const chatLog = messages.slice(-20).map((m, i) => `${i + 1}. ${m}`).join("\n");
  const recentSpeech = transcript.slice(-4).join(" | ");

  const prompt = `You are an AI co-pilot for a live streamer using Stream Mind.

Recent chat comments:
${chatLog || "(no chat yet)"}

Streamer recently said: "${recentSpeech || "(nothing yet)"}"

Return ONLY a JSON object, no markdown:
{
  "suggestedReply": "Short engaging thing the streamer could say right now (1-2 sentences, natural and hype)",
  "chatSummary": "1-sentence vibe check of the chat energy right now",
  "modAlert": null
}

If any comments look toxic/spammy, set modAlert to a short warning string instead of null.`;

  try {
    const result = await getGeminiModel("chat").generateContent(prompt);
    const raw = result.response.text().trim();
    const match = raw.match(/\{[\s\S]*\}/);
    let parsed = { suggestedReply: "", chatSummary: "", modAlert: null as string | null };
    try { parsed = JSON.parse(match?.[0] ?? "{}"); } catch {}
    res.json(parsed);
  } catch (err) {
    console.error("[Copilot] Error:", err);
    res.status(500).json({ error: "Copilot failed" });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/live" });

async function createGeminiLiveToken(): Promise<{ token: string; expireTime: string; newSessionExpireTime: string }> {
  if (!liveTokenClient) throw new Error("Missing GEMINI_API_KEY");

  const now = new Date();
  const expireTime = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(now.getTime() + 60 * 1000).toISOString();
  const token = await liveTokenClient.authTokens.create({
    config: {
      uses: 1,
      expireTime,
      newSessionExpireTime,
      httpOptions: { apiVersion: "v1alpha" },
    },
  });
  if (!token.name) throw new Error("Gemini live token missing name");

  console.log(`[LiveDebug] token created expires=${expireTime} sessionUntil=${newSessionExpireTime}`);

  return { token: token.name, expireTime, newSessionExpireTime };
}

async function createGeminiLiveUrl(): Promise<string> {
  const { token } = await createGeminiLiveToken();
  return `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${token}`;
}

app.post("/api/live-token", async (_req, res) => {
  try {
    const token = await createGeminiLiveToken();
    res.json(token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create live token";
    console.error("[LiveDebug] token route error:", message);
    res.status(500).json({ error: message });
  }
});

wss.on("connection", (client) => {
  console.log("[Live] Client connected");

  let geminiWs: WebSocket | null = null;
  let ready = false;
  const queue: string[] = [];

  createGeminiLiveUrl()
    .then((url) => {
      console.log("[LiveDebug] opening Gemini websocket");
      geminiWs = new WebSocket(url);

      geminiWs.on("open", () => {
        console.log(`[LiveDebug] socket open model=models/${GEMINI_MODELS.live}`);
        const setup = {
          setup: {
            model: `models/${GEMINI_MODELS.live}`,
            generationConfig: {
              responseModalities: ["TEXT"],
            },
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                silenceDurationMs: 1200,
                prefixPaddingMs: 300,
                endOfSpeechSensitivity: "END_SENSITIVITY_UNSPECIFIED",
                startOfSpeechSensitivity: "START_SENSITIVITY_UNSPECIFIED",
              },
              activityHandling: "ACTIVITY_HANDLING_UNSPECIFIED",
              turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY",
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction: {
              parts: [{ text: `You are Panda, a live voice assistant inside a streaming app.
You can talk naturally to the streamer about anything and help with tasks.
Keep replies short, warm, and direct.
If the user is just speaking generally, reply conversationally.
If the user asks for a task, help clearly in plain language.
Do not use JSON.` }],
            },
          },
        };
        console.log("[LiveDebug] sending setup");
        geminiWs?.send(JSON.stringify(setup));
      });

      geminiWs.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        console.log(`[LiveDebug] message keys=${Object.keys(msg).join(",")}`);

        if (msg.setupComplete) {
          console.log("[Live] Gemini setup complete");
          ready = true;
          queue.forEach((m) => geminiWs?.send(m));
          queue.length = 0;
          client.send(JSON.stringify({ type: "ready" }));
          return;
        }

        const inputTranscript = msg.serverContent?.inputTranscription?.text;
        if (inputTranscript) {
          console.log(`[LiveDebug] input transcript=${inputTranscript.slice(0, 80)}`);
          client.send(JSON.stringify({ type: "transcript", text: inputTranscript }));
        }

        const liveText = msg.serverContent?.modelTurn?.parts
          ?.map((part: { text?: string }) => part.text?.trim())
          .filter(Boolean)
          .join(" ");
        if (liveText) {
          console.log(`[LiveDebug] model text=${liveText.slice(0, 120)}`);
          client.send(JSON.stringify({ type: "response", text: liveText }));
        }

        const outputTranscript = msg.serverContent?.outputTranscription?.text;
        if (outputTranscript && !liveText) {
          console.log(`[LiveDebug] output transcript=${outputTranscript.slice(0, 120)}`);
          client.send(JSON.stringify({ type: "response", text: outputTranscript }));
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
    })
    .catch((err: Error) => {
      console.error("[Live] Token error:", err.message);
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "error", message: err.message }));
        client.close();
      }
    });

  client.on("message", (data) => {
    const msg = JSON.parse(data.toString()) as { audio?: string; text?: string };
    console.log(`[LiveDebug] client message audio=${Boolean(msg.audio)} text=${msg.text?.slice(0, 80) ?? ""}`);

    let payload = "";
    if (msg.audio) {
      payload = JSON.stringify({
        realtimeInput: {
          audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" },
        },
      });
    } else if (msg.text?.trim()) {
      payload = JSON.stringify({
        realtimeInput: {
          text: msg.text.trim(),
        },
      });
    }

    if (!payload) return;
    if (ready && geminiWs?.readyState === WebSocket.OPEN) {
      geminiWs.send(payload);
    } else {
      queue.push(payload);
    }
  });

  client.on("close", () => {
    console.log("[Live] Client disconnected");
    if (geminiWs?.readyState === WebSocket.OPEN) {
      geminiWs.close();
    }
  });
});

server.listen(Number(PORT), HOST, () => {
  console.log(`Backend running on ${getServerUrls(PORT).join(" | ")}`);
});
