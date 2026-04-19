/** Real Remotion renderer for Hacktour video exports. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { RemotionComposition, RenderMediaClip, RemotionRenderProps } from "../types/remotion";

const OUTPUT_DIR = "/tmp/hacktour-outputs";
const MEDIA_DIR = "/tmp/hacktour-media";

let bundlePromise: Promise<string> | null = null;

/** Create the temp folders used by the Remotion renderer. */
export function ensureRenderDirs() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

/** Copy uploaded videos into a stable folder that Remotion can fetch over HTTP. */
export function stageMediaFiles(
  files: Express.Multer.File[],
  jobId: string,
  port = Number(process.env.PORT || 3001)
): { mediaClips: RenderMediaClip[]; cleanup: () => void } {
  ensureRenderDirs();
  const jobDir = path.join(MEDIA_DIR, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const mediaClips = files.map((file, index) => {
    const filename = sanitizeFilename(file.originalname || `clip-${index + 1}.mp4`);
    const stagedPath = path.join(jobDir, filename);
    fs.copyFileSync(file.path, stagedPath);
    return {
      id: String(index),
      name: file.originalname || filename,
      duration: 0,
      src: `http://127.0.0.1:${port}/media/${jobId}/${encodeURIComponent(filename)}`,
    };
  });

  return {
    mediaClips,
    cleanup: () => fs.rmSync(jobDir, { recursive: true, force: true }),
  };
}

/** Render one composition to an MP4 using Remotion. */
export async function renderRemotionVideo(
  composition: RemotionComposition,
  mediaClips: RenderMediaClip[],
  jobId: string
): Promise<string> {
  ensureRenderDirs();
  const serveUrl = await getServeUrl();
  const inputProps: RemotionRenderProps = { composition, mediaClips };
  const selected = await selectComposition({ serveUrl, id: "hacktour-video", inputProps });
  const outputPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);

  await renderMedia({
    serveUrl,
    composition: selected,
    inputProps,
    codec: "h264",
    outputLocation: outputPath,
    overwrite: true,
    logLevel: "info",
  });

  return outputPath;
}

/** Bundle the Remotion project once and reuse it across renders. */
async function getServeUrl() {
  if (!bundlePromise) {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const rootDir = path.resolve(currentDir, "../..");
    const entryPoint = path.resolve(rootDir, "src/remotion/index.ts");

    bundlePromise = bundle({
      entryPoint,
      rootDir,
      onProgress: (progress) => console.log(`[Remotion] bundle ${progress}%`),
    });
  }

  return bundlePromise;
}

/** Keep staged filenames safe and simple. */
function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "-");
}
