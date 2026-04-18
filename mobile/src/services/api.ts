/** API service for communicating with the Stream Mind backend */
import { Platform } from "react-native";

const API_BASE =
  Platform.OS === "web"
    ? "http://localhost:3001"
    : "http://10.231.110.105:3001";

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/** Sends clips with thumbnails and prompt to the AI edit endpoint */
export async function generateEdit(
  prompt: string,
  clips: { name: string; duration: number; thumbnail?: string }[]
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 65000);

  const res = await fetch(`${API_BASE}/api/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, clips }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `API error: ${res.status}`);
  }
  // Return both composition and optional clipId (present only when auto-save succeeded)
  return { composition: data.composition, clipId: data.clipId as string | undefined };
}

/** Saves a generated clip to the library */
export async function saveClip(payload: {
  prompt: string;
  composition: object;
  sourceVideoUrl: string;
  durationSeconds?: number;
}) {
  const res = await fetch(`${API_BASE}/api/clips`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || `API error: ${res.status}`);
  return data.clip;
}

/** Returns all saved clips from the library, newest first */
export async function listClips() {
  const res = await fetch(`${API_BASE}/api/clips`);
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || `API error: ${res.status}`);
  return data.clips;
}

/** Searches clips by semantic similarity to a text query */
export async function searchClips(query: string, limit = 10) {
  const res = await fetch(`${API_BASE}/api/clips/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || `API error: ${res.status}`);
  return data.results;
}
