/**
 * YouTube OAuth2 + upload routes
 * Ported from Tech-Europe-26.
 *
 * GET  /api/youtube/auth        — redirect to Google OAuth consent
 * GET  /api/youtube/callback    — OAuth2 redirect URI
 * GET  /api/youtube/status      — { configured, connected, channelTitle }
 * POST /api/youtube/disconnect  — clear stored tokens
 * POST /api/youtube/upload      — upload a base64 clip directly
 */
import { Router } from "express";
import {
  exchangeCode,
  getAuthUrl,
  isConfigured,
  isConnected,
  ytTokens,
  disconnectYouTube,
  uploadClipToYouTube,
} from "../services/youtube";

const router = Router();

/**
 * GET /api/youtube/auth
 * Redirects browser to Google OAuth consent screen.
 */
router.get("/youtube/auth", (req, res) => {
  if (!isConfigured()) {
    res.status(400).send(`
      <html><body style="font:14px sans-serif;padding:40px;background:#09090b;color:#fafafa">
        <h2>⚠️ YouTube OAuth not configured</h2>
        <p>Add <code>YOUTUBE_CLIENT_ID</code> and <code>YOUTUBE_CLIENT_SECRET</code> to your <code>.env</code> file.</p>
      </body></html>
    `);
    return;
  }
  res.redirect(getAuthUrl());
});

/**
 * GET /api/youtube/callback
 * OAuth2 redirect URI — exchanges code for tokens.
 */
router.get("/youtube/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const error = req.query.error as string | undefined;

  if (error || !code) {
    res.status(400).send(`
      <html><body style="font:14px sans-serif;padding:40px;background:#09090b;color:#fafafa">
        <h2>❌ Auth failed: ${error ?? "no code"}</h2>
        <script>window.close();</script>
      </body></html>
    `);
    return;
  }

  try {
    await exchangeCode(code);
    res.send(`
      <html><body style="font:14px sans-serif;padding:40px;background:#09090b;color:#fafafa;text-align:center">
        <div style="margin-top:80px">
          <div style="font-size:48px;margin-bottom:16px">✅</div>
          <h2 style="color:#fff;margin-bottom:8px">Connected to YouTube!</h2>
          <p style="color:#71717a">Logged in as <strong style="color:#fafafa">${ytTokens.channelTitle ?? "your channel"}</strong></p>
          <p style="color:#71717a;margin-top:24px">You can close this tab.</p>
          <script>setTimeout(() => window.close(), 2000);</script>
        </div>
      </body></html>
    `);
  } catch (err: any) {
    res.status(500).send(`
      <html><body style="font:14px sans-serif;padding:40px;background:#09090b;color:#fafafa">
        <h2>❌ Auth error</h2>
        <p>${err.message}</p>
        <script>window.close();</script>
      </body></html>
    `);
  }
});

/**
 * GET /api/youtube/status
 */
router.get("/youtube/status", (_req, res) => {
  res.json({
    configured: isConfigured(),
    connected: isConnected(),
    channelTitle: ytTokens.channelTitle,
  });
});

/**
 * POST /api/youtube/disconnect
 */
router.post("/youtube/disconnect", (_req, res) => {
  disconnectYouTube();
  res.json({ ok: true });
});

/**
 * POST /api/youtube/upload
 * Body: { videoData: string (base64), mimeType: string, title: string, description?: string, privacyStatus?: string }
 * Streams progress via polling — returns { videoId, url } on completion.
 */
router.post("/youtube/upload", async (req, res) => {
  if (!isConnected()) {
    res.status(400).json({ error: "Not connected to YouTube. Visit /api/youtube/auth first." });
    return;
  }

  const { videoData, mimeType, title, description, privacyStatus } = req.body as {
    videoData?: string;
    mimeType?: string;
    title?: string;
    description?: string;
    privacyStatus?: "public" | "unlisted" | "private";
  };

  if (!videoData || !mimeType || !title) {
    res.status(400).json({ error: "Missing required fields: videoData, mimeType, title" });
    return;
  }

  try {
    const result = await uploadClipToYouTube(
      videoData,
      mimeType,
      { title, description, privacyStatus: privacyStatus ?? "unlisted" },
      (pct) => console.log(`[YouTube] Upload progress: ${pct}%`)
    );
    res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[YouTube] Upload error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
