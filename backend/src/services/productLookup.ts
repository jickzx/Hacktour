/** Product lookup using Gemini 3.0 Flash with Google Search grounding. */
import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODELS } from "./modelConfig";

export interface ProductLookupResult {
  title: string;
  price?: string;
  store?: string;
  url: string;
  displayUrl: string;
  summary: string;
}

let client: GoogleGenAI | null = null;

/** Reuse one Google GenAI client for product search. */
function getClient() {
  if (!process.env.GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

/** Find a product page and short buy summary from a voice query. */
export async function lookupProduct(query: string): Promise<ProductLookupResult | null> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: GEMINI_MODELS.productLookup,
    contents: `You are a shopping agent. The streamer wants to show viewers a direct product page for: "${query}".

Work in two steps using Google Search:
1. Identify the brand (or most-likely brand) the streamer is referencing.
2. Find the exact product page on that brand's OWN official website first. Only if the brand has no direct product page, or the item is out of stock / unavailable there, fall back to a major trusted retailer (e.g. Amazon, Nordstrom, JD Sports, Selfridges, ASOS, Best Buy, Target). Never use blog posts, review articles, aggregators, resellers, or generic search result pages.

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{
  "title": "short product name",
  "price": "currency + amount if visible",
  "store": "the site the url points to (brand name or retailer)",
  "url": "https://...",
  "summary": "short 1 sentence buy summary"
}

Rules:
- url MUST point directly to a product detail page (PDP) on the brand or retailer, not a homepage, category page, or search page.
- "store" must match what is actually hosting the url (don't say "Nike" if the url is nordstrom.com).
- Keep title under 80 chars, summary under 120 chars.
- If no credible product page can be found, return {"title":"","url":"","summary":""}.`,
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.2,
    },
  });

  const raw = response.text?.trim?.() ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  let parsed: { title?: string; price?: string; store?: string; url?: string; summary?: string } = {};
  try {
    parsed = JSON.parse(match?.[0] ?? "{}");
  } catch {
    console.warn("[ProductLookup] JSON parse failed:", raw.slice(0, 200));
  }

  const url = String(parsed.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) return null;

  return {
    title: String(parsed.title ?? query).trim().slice(0, 80),
    price: parsed.price ? String(parsed.price).trim().slice(0, 30) : undefined,
    store: parsed.store ? String(parsed.store).trim().slice(0, 40) : undefined,
    url,
    displayUrl: url.replace(/^https?:\/\//i, "").slice(0, 60),
    summary: String(parsed.summary ?? `Buy link for ${query}`).trim().slice(0, 120),
  };
}
