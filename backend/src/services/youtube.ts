/**
 * YouTube OAuth2 + Data API v3 integration
 * Ported from Tech-Europe-26.
 *
 * Required env vars:
 *   YOUTUBE_CLIENT_ID
 *   YOUTUBE_CLIENT_SECRET
 *   YOUTUBE_REDIRECT_URI  (default: http://localhost:3001/api/youtube/callback)
 */

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET ?? "";
const REDIRECT_URI =
  process.env.YOUTUBE_REDIRECT_URI ?? "http://localhost:3001/api/youtube/callback";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

// ── Token store (in-memory, survives hot reload) ──────────────────────────────
const g = globalThis as any;
if (!g.__ytTokens) {
  g.__ytTokens = {
    accessToken: null,
    refreshToken: null,
    expiresAt: 0,
    channelTitle: null,
  };
}

export const ytTokens: {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number;
  channelTitle: string | null;
} = g.__ytTokens;

// ── Pending upload state ──────────────────────────────────────────────────────
if (!g.__pendingYouTubeClipId) g.__pendingYouTubeClipId = null;

// ── OAuth helpers ─────────────────────────────────────────────────────────────

export function isConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

export function isConnected() {
  return Boolean(ytTokens.accessToken || ytTokens.refreshToken);
}

export function getAuthUrl(state?: string) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    ...(state ? { state } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  ytTokens.accessToken = data.access_token;
  if (data.refresh_token) ytTokens.refreshToken = data.refresh_token;
  ytTokens.expiresAt = Date.now() + data.expires_in * 1000;

  try {
    ytTokens.channelTitle = await getChannelTitle();
  } catch {}

  return data;
}

async function refreshAccessToken() {
  if (!ytTokens.refreshToken) throw new Error("No refresh token stored.");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: ytTokens.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  ytTokens.accessToken = data.access_token;
  ytTokens.expiresAt = Date.now() + data.expires_in * 1000;
  return data.access_token;
}

async function getAccessToken() {
  if (!ytTokens.accessToken && !ytTokens.refreshToken) {
    throw new Error("Not authenticated with YouTube.");
  }
  if (Date.now() >= ytTokens.expiresAt - 60_000) {
    await refreshAccessToken();
  }
  return ytTokens.accessToken!;
}

async function getChannelTitle(): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = (await res.json()) as any;
  return data.items?.[0]?.snippet?.title ?? "Your Channel";
}

export function disconnectYouTube() {
  ytTokens.accessToken = null;
  ytTokens.refreshToken = null;
  ytTokens.expiresAt = 0;
  ytTokens.channelTitle = null;
}

// ── Upload ────────────────────────────────────────────────────────────────────

export type UploadOptions = {
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus?: "public" | "unlisted" | "private";
};

/**
 * Upload a video to YouTube using resumable upload with progress callbacks.
 * videoData: base64-encoded video
 * mimeType: e.g. "video/mp4" or "video/quicktime"
 * onProgress: called with 0–100 as upload progresses
 */
export async function uploadClipToYouTube(
  videoData: string,
  mimeType: string,
  opts: UploadOptions,
  onProgress?: (pct: number) => void
): Promise<{ videoId: string; url: string }> {
  const token = await getAccessToken();

  const metadata = {
    snippet: {
      title: opts.title,
      description: opts.description ?? "",
      tags: opts.tags ?? ["streammind", "livestream", "clip"],
      categoryId: "20", // Gaming
    },
    status: {
      privacyStatus: opts.privacyStatus ?? "unlisted",
      selfDeclaredMadeForKids: false,
    },
  };

  // Step 1: Initiate resumable upload
  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": mimeType,
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`Failed to initiate YouTube upload: ${err}`);
  }

  const uploadUrl = initRes.headers.get("Location");
  if (!uploadUrl) throw new Error("No upload URL returned from YouTube.");

  // Step 2: Upload in 256 KB chunks with progress
  const videoBuffer = Buffer.from(videoData, "base64");
  const totalBytes = videoBuffer.byteLength;
  const CHUNK_SIZE = 256 * 1024;
  let uploadedBytes = 0;

  while (uploadedBytes < totalBytes) {
    const end = Math.min(uploadedBytes + CHUNK_SIZE, totalBytes);
    const chunk = videoBuffer.slice(uploadedBytes, end);

    const chunkRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(chunk.byteLength),
        "Content-Range": `bytes ${uploadedBytes}-${end - 1}/${totalBytes}`,
      },
      body: chunk,
    });

    if (chunkRes.status === 308) {
      uploadedBytes = end;
      onProgress?.(Math.round((uploadedBytes / totalBytes) * 100));
      continue;
    }

    if (chunkRes.status === 200 || chunkRes.status === 201) {
      onProgress?.(100);
      const result = (await chunkRes.json()) as { id: string };
      return { videoId: result.id, url: `https://youtu.be/${result.id}` };
    }

    const err = await chunkRes.text();
    throw new Error(`YouTube upload failed (${chunkRes.status}): ${err}`);
  }

  throw new Error("Upload completed without a final response from YouTube.");
}
