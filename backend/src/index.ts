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
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenerativeAI } from "@google/generative-ai";
import editRouter from "./routes/edit";
import clipsRouter from "./routes/clips";
import processRouter from "./routes/process";
import youtubeRouter from "./routes/youtube";

const app = express();
const PORT = process.env.PORT || 3001;

const upload = multer({ dest: "/tmp/hacktour-uploads/" });

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use("/outputs", express.static("/tmp/hacktour-outputs/"));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", editRouter);
app.use("/api", clipsRouter);
app.use("/api", processRouter);
app.use("/api", youtubeRouter);

function getGemini() {
  if (!process.env.GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");
  const model = process.env.GEMINI_MODEL ?? "gemini-3.1-flash";
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model });
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
    const base64 = fs.readFileSync(filePath).toString("base64");
    const result = await getGemini().generateContent([
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

  console.log(`[Analyse] frame ${(base64.length * 0.75 / 1024).toFixed(1)}KB, context: ${context.length}`);

  try {
    const recentSpeech = context.join(" ... ");

    const COMMENTS_SYSTEM = emojiMode
      ? `You are a Twitch/Kick chat viewer in EMOJI ONLY mode. React using ONLY emojis — no words. Return a JSON array of 8-12 objects: [{"user":"name","text":"🔥😂","avatar":"emoji"},...]`
      : `You are a hype Gen Z Twitch/Kick/Bilibili chat. Return ONLY a valid JSON array, no markdown.
Generate 8-12 short authentic viewer comments reacting to the scene and streamer speech.
Rules:
- SHORT (1-8 words) like real live chat
- Mix: hype, jokes, memes, questions, reactions, emojis
- Varied case (caps, lowercase, emoji-only)
- Realistic usernames with numbers/underscores
- 80% English, 20% Chinese Simplified slang (哇塞, 666, 太厉害了, 笑死我了, 牛啊, 绝了, 哈哈哈, nb)
- High energy — never repeat same comment
[{"user":"name","text":"comment","avatar":"emoji"},...]`;

    // Step 1: scene analysis with frame + transcript context
    const videoRes = await getGemini().generateContent([
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

    const reactResult = await getGemini().generateContent(`${COMMENTS_SYSTEM}\n\n${commentContext}`);
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
    const result = await getGemini().generateContent({
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
The app has 3 tabs: home, edit (AI video editor), live (live streaming).
While live streaming you can control the stream with the following commands.
You have a fun, chill, streamer-friendly personality with panda energy. Keep responses short (1-2 sentences max).

Always respond with valid JSON only — no markdown:
{"response":"what you say back","action":{"type":"action_type"}}

Action types:
- navigate_tab → include "tab":"home"|"edit"|"live"
- go_live — start the stream
- end_stream — end the stream
- mute — mute mic
- unmute — unmute mic
- flip_camera — switch front/back camera
- create_poll → include "poll":{"question":"Which do you prefer?","options":["Option A","Option B"]}
- close_poll — dismiss the active poll
- emoji_mode — toggle emoji-only mode (Zee responds in emojis only, chat AI comments go emoji-only)
- hype — blast a wave of hype messages into chat
- shoutout → include "user":"<username>" to shout out a viewer (e.g. "panda shoutout xX_fan99")
- countdown → include "seconds":<number> (default 5) to start a countdown in chat
- none

If you detect the streamer is asking chat to choose between things, use create_poll automatically.
If no action needed use {"type":"none"}.`;

  try {
    const fullPrompt = [
      systemPrompt,
      ...(!pollOnly && context.length ? [`Recent stream context: ${context.slice(-3).join(" | ")}`] : []),
      command,
    ].join("\n\n");

    const result = await getGemini().generateContent(fullPrompt);
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
    const result = await getGemini().generateContent(prompt);
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
