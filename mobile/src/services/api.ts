/** API service for communicating with the Stream Mind backend */
import { BACKEND_URL as API_BASE } from "./backendUrl";

/**
 * Parse response as JSON, throwing a friendly error if the server returns
 * HTML (e.g. an expired ngrok tunnel or a 404 page) instead of JSON.
 */
async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.slice(0, 60).trim();
    throw new Error(
      preview.startsWith("<")
        ? "Backend unreachable — check your ngrok tunnel is running"
        : `Bad response from server: ${preview}`
    );
  }
}

/** Uploads actual video files, processes them with ffmpeg, returns processed video URL */
export async function processEdit(
  prompt: string,
  clips: { name: string; duration: number; thumbnail?: string; uri: string; trimStart?: number; trimEnd?: number }[]
): Promise<{ videoUrl: string; composition: object; clipId?: string }> {
  const form = new FormData();
  form.append("prompt", prompt);

  const clipsMetadata = clips.map(({ name, duration, thumbnail, trimStart, trimEnd }) => ({ name, duration, thumbnail, trimStart, trimEnd }));
  form.append("clipsMetadata", JSON.stringify(clipsMetadata));

  for (const clip of clips) {
    const ext = clip.name.match(/\.(mp4|mov|avi|m4v)$/i)?.[0] ?? ".mp4";
    const filename = clip.name.endsWith(ext) ? clip.name : `${clip.name}${ext}`;
    form.append("videos", { uri: clip.uri, name: filename, type: "video/mp4" } as any);
  }

  const res = await fetch(`${API_BASE}/api/process`, { method: "POST", body: form });
  const data = await safeJson(res);
  if (!res.ok || !data.success) throw new Error(data.error || `API error: ${res.status}`);
  return { videoUrl: `${API_BASE}${data.videoUrl}`, composition: data.composition, clipId: data.clipId };
}

/** Returns all saved clips from the library, newest first */
export async function listClips() {
  const res = await fetch(`${API_BASE}/api/clips`);
  const data = await safeJson(res);
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
  const data = await safeJson(res);
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
  const data = await safeJson(res);
  if (!res.ok || !data.success) throw new Error(data.error || `API error: ${res.status}`);
  return data.photo;
}

/** Lists all photos in the library, newest first */
export async function listPhotos(): Promise<Photo[]> {
  const res = await fetch(`${API_BASE}/api/photos`);
  const data = await safeJson(res);
  if (!res.ok || !data.success) throw new Error(data.error || `API error: ${res.status}`);
  return data.photos;
}

/** Runs a saved photo through the Gemini image editor and returns the edited entry */
export async function editPhoto(photoId: string): Promise<Photo> {
  const res = await fetch(`${API_BASE}/api/photos/${photoId}/edit`, { method: "POST" });
  const data = await safeJson(res);
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
  const data = await safeJson(res);
  if (!res.ok || !data.success) throw new Error(data.error || `API error: ${res.status}`);
  return data.items as OutfitItem[];
}
