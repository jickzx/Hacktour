/**
 * Google text-embedding-004 API client and cosine similarity helper
 * Used to embed clip prompts for semantic search in the clip library
 */

const EMBEDDING_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent";

/**
 * Embeds a text string using Google's text-embedding-004 model.
 * Returns a 768-dimensional float vector.
 */
export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_EMBEDDING_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set in environment");

  const res = await fetch(`${EMBEDDING_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/text-embedding-004",
      content: { parts: [{ text }] },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Embedding API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.embedding.values as number[];
}

/**
 * Computes cosine similarity between two equal-length vectors.
 * Returns a value between -1 and 1 (1 = identical direction).
 * Returns 0 if either vector has zero magnitude.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
