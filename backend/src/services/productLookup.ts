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
    contents: `Find the best direct product page for this shopping request: "${query}".

Prefer official brand or major retailer product pages over blog posts, review pages, or generic search results.
Return ONLY a JSON object with this exact shape:
{
  "title": "short product name",
  "price": "$160",
  "store": "Nike",
  "url": "https://...",
  "summary": "short 1 sentence buy summary"
}

Rules:
- url must be a direct webpage someone could click to buy or view the exact item.
- If an exact product page is not available, use the closest credible shopping page.
- Keep title under 80 chars.
- Keep summary under 120 chars.
- If you cannot find a credible result, return {"title":"","url":"","summary":""}.`,
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
