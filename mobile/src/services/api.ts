/** API service for communicating with the Stream Mind backend */
import { Platform } from "react-native";

const API_BASE =
  process.env.EXPO_PUBLIC_BACKEND_URL ??
  (Platform.OS === "web" ? "http://localhost:3001" : "http://100.80.219.114:3001");

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
  const res = await fetch(`${API_BASE}/api/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, clips }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `API error: ${res.status}`);
  }
  // Return both composition and optional clipId (present only when auto-save succeeded)
  return { composition: data.composition, clipId: data.clipId as string | undefined };
}

/** Uploads actual video files, processes them with ffmpeg, returns processed video URL */
export async function processEdit(
  prompt: string,
  clips: { name: string; duration: number; thumbnail?: string; uri: string }[]
): Promise<{ videoUrl: string; composition: object; clipId?: string }> {
  const form = new FormData();
  form.append("prompt", prompt);

  const clipsMetadata = clips.map(({ name, duration, thumbnail }) => ({ name, duration, thumbnail }));
  form.append("clipsMetadata", JSON.stringify(clipsMetadata));

  for (const clip of clips) {
    const ext = clip.name.match(/\.(mp4|mov|avi|m4v)$/i)?.[0] ?? ".mp4";
    const filename = clip.name.endsWith(ext) ? clip.name : `${clip.name}${ext}`;
    form.append("videos", { uri: clip.uri, name: filename, type: "video/mp4" } as any);
  }

  const res = await fetch(`${API_BASE}/api/process`, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || `API error: ${res.status}`);
  return { videoUrl: `${API_BASE}${data.videoUrl}`, composition: data.composition, clipId: data.clipId };
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

export interface Photo {
  id: string;
  filename: string;
  url: string;
  caption: string;
  createdAt: string;
  sessionId: string;
  variant?: "original" | "edited";
  parentId?: string;
}

/** Uploads a captured photo to the library */
export async function uploadPhoto(params: { uri: string; caption: string; sessionId: string }): Promise<Photo> {
  const form = new FormData();
  form.append("photo", { uri: params.uri, name: `photo-${Date.now()}.jpg`, type: "image/jpeg" } as any);
  form.append("caption", params.caption);
  form.append("sessionId", params.sessionId);
  const res = await fetch(`${API_BASE}/api/photos`, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || `API error: ${res.status}`);
  return data.photo;
}

/** Lists all photos in the library, newest first */
export async function listPhotos(): Promise<Photo[]> {
  const res = await fetch(`${API_BASE}/api/photos`);
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || `API error: ${res.status}`);
  return data.photos;
}

/** Runs a saved photo through the Gemini image editor ("Nano Banana 2") and returns the edited entry */
export async function editPhoto(photoId: string): Promise<Photo> {
  const res = await fetch(`${API_BASE}/api/photos/${photoId}/edit`, { method: "POST" });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || `API error: ${res.status}`);
  return data.photo;
}

/** Builds an absolute URL for a photo file relative to the API host */
export function photoUrl(relative: string): string {
  if (/^https?:/i.test(relative)) return relative;
  return `${API_BASE}${relative}`;
}

export interface OutfitItem {
  label: string;
  query: string;
  searchUrl: string;
}

/** Sends a photo to the outfit identifier endpoint */
export async function identifyOutfit(uri: string): Promise<OutfitItem[]> {
  const form = new FormData();
  form.append("photo", { uri, name: `outfit-${Date.now()}.jpg`, type: "image/jpeg" } as any);
  const res = await fetch(`${API_BASE}/api/outfit`, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || `API error: ${res.status}`);
  return data.items as OutfitItem[];
}
