/**
 * modelConfig - central Gemini model names used by the backend.
 *
 * The 3.x Gemini models live on the v1alpha endpoint, so every model here
 * is fetched with `apiVersion: "v1alpha"`. Each entry can be overridden with
 * an env var so you can flip to a newer preview without code edits.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";

const pick = (envKey: string, fallback: string) => process.env[envKey]?.trim() || fallback;

export const GEMINI_MODELS = {
  // General text generation (chat bubbles, copilot, simple prompts)
  defaultText:       pick("GEMINI_MODEL_TEXT",          "gemini-3.1-flash-lite-preview"),
  // Short conversational turns — wants to be fast and cheap
  chat:              pick("GEMINI_MODEL_CHAT",          "gemini-3.1-flash-lite-preview"),
  // Panda's action-detection endpoint; structured JSON out
  assistant:         pick("GEMINI_MODEL_ASSISTANT",     "gemini-3.1-flash-lite-preview"),
  // Audio transcription (REST path)
  transcription:     pick("GEMINI_MODEL_TRANSCRIPTION", "gemini-3.1-flash-lite-preview"),
  // Video composition planning (needs more reasoning)
  videoComposition:  pick("GEMINI_MODEL_VIDEO",         "gemini-3.0-flash-preview"),
  // Product lookup for pullUpProduct
  productLookup:     pick("GEMINI_MODEL_PRODUCT",       "gemini-3.1-flash-lite-preview"),
  // Image generation / editing (Nano Banana family)
  imageEdit:         pick("GEMINI_MODEL_IMAGE",         "gemini-2.5-flash-image-preview"),
  // Bidirectional Live API over WebSocket
  live:              pick("GEMINI_MODEL_LIVE",          "gemini-3.1-flash-live"),
} as const;

export type GeminiModelKey = keyof typeof GEMINI_MODELS;

let client: GoogleGenerativeAI | null = null;

/**
 * Reuse one Gemini client across requests.
 */
function getGeminiClient(): GoogleGenerativeAI {
  if (!process.env.GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");
  client ??= new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return client;
}

/**
 * Create a configured Gemini model for a named app task.
 * Uses v1alpha so the 3.x flash previews actually resolve.
 */
export function getGeminiModel(kind: GeminiModelKey) {
  return getGeminiClient().getGenerativeModel(
    { model: GEMINI_MODELS[kind] },
    { apiVersion: "v1alpha" }
  );
}
