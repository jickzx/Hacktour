/**
 * modelConfig - central Gemini model names used by the backend.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";

export const GEMINI_MODELS = {
  defaultText: "gemini-3.1-flash",
  chat: "gemini-3.1-flash-lite-preview",
  assistant: "gemini-3.1-flash-lite-preview",
  transcription: "gemini-3.1-flash-lite-preview",
  videoComposition: "gemini-3-flash-preview",
  imageEdit: "gemini-2.5-flash-image-preview",
  live: "gemini-3.1-flash-live-preview",
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
 */
export function getGeminiModel(kind: GeminiModelKey) {
  return getGeminiClient().getGenerativeModel({ model: GEMINI_MODELS[kind] });
}
