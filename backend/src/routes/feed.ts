/**
 * Feed route — AI-generated XHS-style trending Chinese content feed.
 * GET /api/feed  →  returns array of FeedPost objects.
 * Uses z.ai GLM (glm-5-turbo) — same client as the rest of the backend.
 * Response is cached for 5 minutes so repeated refreshes don't spam the API.
 */
import { Router } from "express";
import OpenAI from "openai";

const router = Router();

interface FeedPost {
  id: string;
  title: string;
  author: string;
  likes: number;
  ratio: number;
  tintA: string;
  tintB: string;
  isVideo?: boolean;
  isLive?: boolean;
  tag?: string;
}

interface CacheEntry { posts: FeedPost[]; expiresAt: number }
let cache: CacheEntry | null = null;

const PALETTE: [string, string][] = [
  ["#B8C9D9", "#6B8BAA"], ["#E8D4B8", "#C89968"], ["#3A3028", "#1A1410"],
  ["#F0E8DC", "#D4C4A8"], ["#8B5A3C", "#3D2617"], ["#FFB8C8", "#FF2442"],
  ["#FF8A65", "#C04A1B"], ["#2E2E3A", "#0F0F14"], ["#C8E6C9", "#388E3C"],
  ["#E1BEE7", "#7B1FA2"], ["#FFF9C4", "#F9A825"], ["#B2EBF2", "#0097A7"],
];

const SYSTEM_PROMPT = `You generate a realistic Xiaohongshu (小红书 / rednote) trending feed for a London-based AI social media app demo.

Return a JSON array of exactly 10 post objects. Each post should feel like a real XHS post trending right now in 2026 — authentic Chinese internet culture, slang, memes, and trends mixed with some London/overseas life content.

Include a mix of:
- 穿搭 OOTD / fashion posts ("今日份穿搭", "#显瘦穿搭", 多巴胺穿搭 etc.)
- 梗图 / viral memes (current Chinese internet humour)
- 好物种草 product reviews ("真的绝了", "姐妹们冲！")
- 留学/海外生活 (London life, UK university, 打工度假)
- 美食探店 (food discovery, cafe hopping)
- 职场/实习 content ("大厂内推", "offer来了！")
- 娱乐/综艺 reactions
- AI/科技 content (since this is an AI hackathon)

Each object must have EXACTLY these fields:
{
  "id": "unique string",
  "title": "post title in Chinese (can mix English) — 10-40 chars, authentic XHS style with emojis",
  "author": "realistic XHS username (mix of Chinese/English, numbers, underscores)",
  "likes": number between 100 and 50000,
  "ratio": number between 0.85 and 1.6,
  "tintIndex": number 0-11,
  "isVideo": boolean,
  "isLive": boolean (at most 1 post should be live),
  "tag": "one category tag in Chinese e.g. 穿搭, 美食, 梗图, 科技, 留学"
}

Return ONLY the JSON array. No markdown, no explanation.`;

function getGlm() {
  if (!process.env.ZAI_API_KEY || !process.env.ZAI_BASE_URL) {
    throw new Error("Missing ZAI_API_KEY or ZAI_BASE_URL");
  }
  return new OpenAI({ apiKey: process.env.ZAI_API_KEY, baseURL: process.env.ZAI_BASE_URL });
}

async function generateFeed(): Promise<FeedPost[]> {
  const client = getGlm();
  const model = process.env.ZAI_MODEL_CHAT ?? "glm-5-turbo";

  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: SYSTEM_PROMPT }],
    temperature: 0.9,
    max_tokens: 1500,
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "[]";
  const json = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  const raw = JSON.parse(json) as Array<Record<string, unknown>>;

  return raw.map((p, i) => {
    const idx = typeof p.tintIndex === "number" ? (p.tintIndex as number) % PALETTE.length : i % PALETTE.length;
    const [tintA, tintB] = PALETTE[idx];
    return {
      id: String(p.id ?? `feed-${i}`),
      title: String(p.title ?? ""),
      author: String(p.author ?? ""),
      likes: Number(p.likes ?? 0),
      ratio: Number(p.ratio ?? 1.1),
      tintA,
      tintB,
      isVideo: Boolean(p.isVideo),
      isLive: Boolean(p.isLive),
      tag: String(p.tag ?? ""),
    };
  });
}

/** GET /feed — returns cached AI-generated XHS feed (5 min TTL) */
router.get("/feed", async (_req, res) => {
  try {
    const now = Date.now();
    if (cache && cache.expiresAt > now) {
      res.json({ success: true, posts: cache.posts, cached: true });
      return;
    }

    console.log("[Feed] Generating new feed via GLM…");
    const posts = await generateFeed();
    cache = { posts, expiresAt: now + 5 * 60 * 1000 };
    console.log(`[Feed] Generated ${posts.length} posts`);
    res.json({ success: true, posts, cached: false });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Feed generation failed";
    console.error("[Feed]", msg);
    res.status(500).json({ success: false, error: msg });
  }
});

export default router;
