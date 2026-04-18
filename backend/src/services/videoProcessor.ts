/**
 * videoProcessor — turns a RemotionComposition into a real video using ffmpeg.
 * Single-clip: -vf / -af chain (simple, fast).
 * Multi-clip:  filter_complex with xfade transitions + concat.
 *
 * Subtitle/drawtext overlay support is optional — if the installed ffmpeg
 * was not built with libfreetype the drawtext filter is unavailable and
 * overlays are skipped silently rather than crashing the job.
 */
import ffmpeg from "fluent-ffmpeg";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import type { RemotionComposition, TextOverlay, Transition } from "../types/remotion";

ffmpeg.setFfmpegPath("/opt/homebrew/bin/ffmpeg");

const FONT_PATH = "/System/Library/Fonts/HelveticaNeue.ttc";
const OUTPUT_DIR = "/tmp/hacktour-outputs";

/** Detect once at startup whether drawtext is available in this ffmpeg build */
const DRAWTEXT_AVAILABLE = (() => {
  try {
    const out = execSync("/opt/homebrew/bin/ffmpeg -filters 2>&1", { encoding: "utf8" });
    return out.includes("drawtext");
  } catch {
    return false;
  }
})();

if (!DRAWTEXT_AVAILABLE) {
  console.warn("[videoProcessor] drawtext filter unavailable (ffmpeg built without libfreetype) — subtitle overlays will be skipped");
}

export function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Filter out overlays that cannot be rendered:
 * - empty content
 * - invalid fontSize (must be > 4 to be visible)
 * - drawtext not available at all
 */
function usableOverlays(overlays: TextOverlay[]): TextOverlay[] {
  if (!DRAWTEXT_AVAILABLE) return [];
  return overlays.filter((o) => o.content.trim().length > 0 && (o.fontSize ?? 0) > 4);
}

/** Escape text for ffmpeg drawtext filter */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\u2019") // curly quote avoids shell quoting issues
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/,/g, "\\,");
}

/** Build a single drawtext filter string for one overlay */
function buildDrawtext(o: TextOverlay, fps: number): string {
  const startSec = o.startFrame / fps;
  const endSec = o.endFrame / fps;
  const color = o.color.startsWith("#") ? o.color.replace("#", "") : o.color;
  const text = escapeDrawtext(o.content);
  return (
    `drawtext=fontfile='${FONT_PATH}':` +
    `text='${text}':` +
    `fontsize=${o.fontSize}:` +
    `fontcolor=0x${color}:` +
    `x=(w*${o.x})-(tw/2):` +
    `y=(h*${o.y})-(th/2):` +
    `enable='between(t,${startSec.toFixed(3)},${endSec.toFixed(3)})'`
  );
}

/** Map composition transition type to xfade transition name */
function xfadeType(t: Transition["type"]): string {
  const map: Record<string, string> = {
    fade: "fade",
    dissolve: "dissolve",
    slide: "slideleft",
    wipe: "wipeleft",
    zoom: "zoomin",
  };
  return map[t] ?? "fade";
}

export async function processVideo(
  inputPaths: string[],
  composition: RemotionComposition,
  jobId: string
): Promise<string> {
  ensureOutputDir();
  const outputPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);

  if (inputPaths.length === 1) {
    await processSingleClip(inputPaths[0], composition, outputPath);
  } else {
    await processMultiClip(inputPaths, composition, outputPath);
  }

  return outputPath;
}

/** Simple single-clip pipeline */
async function processSingleClip(
  inputPath: string,
  c: RemotionComposition,
  outputPath: string
): Promise<void> {
  const clip = c.clips[0];
  const trimStart = clip.trimStart ?? 0;
  const trimEnd = clip.trimEnd ?? clip.duration;
  const totalDur = c.totalDurationFrames / c.fps;
  const fadeOutStart = Math.max(0, totalDur - (c.audio.fadeOutFrames ?? 0) / c.fps);

  // Build video filter chain — skip overlays if drawtext unavailable or content empty
  const validOverlays = usableOverlays(c.overlays);
  const vFilters: string[] = [
    `scale=1080:1920:force_original_aspect_ratio=decrease`,
    `pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black`,
    ...validOverlays.map((o) => buildDrawtext(o, c.fps)),
  ];

  // Build audio filter chain
  const aFilters: string[] = [`volume=${c.audio.volume ?? 1}`];
  if ((c.audio.fadeInFrames ?? 0) > 0) {
    aFilters.push(`afade=t=in:st=0:d=${((c.audio.fadeInFrames ?? 0) / c.fps).toFixed(3)}`);
  }
  if ((c.audio.fadeOutFrames ?? 0) > 0) {
    aFilters.push(`afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${((c.audio.fadeOutFrames ?? 0) / c.fps).toFixed(3)}`);
  }

  console.log(`[ffmpeg] overlays total: ${c.overlays.length}, usable: ${validOverlays.length}`);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .seekInput(trimStart)
      .inputOption(`-to ${trimEnd}`)
      .videoFilters(vFilters)
      .audioFilters(aFilters)
      .outputOptions([
        "-c:v h264_videotoolbox",
        "-b:v 4M",
        "-c:a aac",
        "-b:a 128k",
        "-movflags +faststart",
        "-r", String(c.fps),
      ])
      .output(outputPath)
      .on("start", (cmd) => console.log("[ffmpeg] start:", cmd))
      .on("progress", (p) => process.stdout.write(`\r[ffmpeg] ${p.percent?.toFixed(1) ?? "?"}%`))
      .on("end", () => { process.stdout.write("\n"); resolve(); })
      .on("error", (err) => { process.stdout.write("\n"); reject(err); })
      .run();
  });
}

/** Multi-clip pipeline using filter_complex + xfade */
async function processMultiClip(
  inputPaths: string[],
  c: RemotionComposition,
  outputPath: string
): Promise<void> {
  const clips = c.clips;
  const fps = c.fps;
  const validOverlays = usableOverlays(c.overlays);

  const filterParts: string[] = [];

  // Scale each input
  for (let i = 0; i < inputPaths.length; i++) {
    const clip = clips[i];
    const trimStart = clip.trimStart ?? 0;
    const trimEnd = clip.trimEnd ?? clip.duration;
    filterParts.push(
      `[${i}:v]trim=start=${trimStart}:end=${trimEnd},setpts=PTS-STARTPTS,` +
      `scale=1080:1920:force_original_aspect_ratio=decrease,` +
      `pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black[v${i}]`
    );
    filterParts.push(
      `[${i}:a]atrim=start=${trimStart}:end=${trimEnd},asetpts=PTS-STARTPTS,` +
      `volume=${c.audio.volume ?? 1}[a${i}]`
    );
  }

  // Chain xfade transitions
  let prevV = "v0";
  let prevA = "a0";
  let timeOffset = (clips[0].trimEnd ?? clips[0].duration) - (clips[0].trimStart ?? 0);

  for (let i = 0; i < inputPaths.length - 1; i++) {
    const t = c.transitions[i] ?? { type: "fade" as const, durationFrames: 15 };
    const tDur = t.durationFrames / fps;
    const offset = Math.max(0, timeOffset - tDur);
    const outV = i === inputPaths.length - 2 ? "vx" : `vx${i}`;
    const outA = i === inputPaths.length - 2 ? "ax" : `ax${i}`;

    filterParts.push(
      `[${prevV}][v${i + 1}]xfade=transition=${xfadeType(t.type)}:duration=${tDur.toFixed(3)}:offset=${offset.toFixed(3)}[${outV}]`
    );
    filterParts.push(
      `[${prevA}][a${i + 1}]acrossfade=d=${tDur.toFixed(3)}[${outA}]`
    );

    prevV = outV;
    prevA = outA;
    timeOffset += (clips[i + 1].trimEnd ?? clips[i + 1].duration) - (clips[i + 1].trimStart ?? 0) - tDur;
  }

  // Apply text overlays on top of composited video
  let videoChain = prevV;
  for (let i = 0; i < validOverlays.length; i++) {
    const outLabel = i === validOverlays.length - 1 ? "vout" : `vt${i}`;
    filterParts.push(`[${videoChain}]${buildDrawtext(validOverlays[i], fps)}[${outLabel}]`);
    videoChain = outLabel;
  }
  if (validOverlays.length === 0) {
    filterParts.push(`[${prevV}]null[vout]`);
  }

  // Audio fades on final audio stream
  const totalDur = c.totalDurationFrames / fps;
  const fadeOutStart = Math.max(0, totalDur - (c.audio.fadeOutFrames ?? 0) / fps);
  const aFadeFilters: string[] = [];
  if ((c.audio.fadeInFrames ?? 0) > 0) {
    aFadeFilters.push(`afade=t=in:st=0:d=${((c.audio.fadeInFrames ?? 0) / fps).toFixed(3)}`);
  }
  if ((c.audio.fadeOutFrames ?? 0) > 0) {
    aFadeFilters.push(`afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${((c.audio.fadeOutFrames ?? 0) / fps).toFixed(3)}`);
  }
  if (aFadeFilters.length > 0) {
    filterParts.push(`[${prevA}]${aFadeFilters.join(",")}[aout]`);
  } else {
    filterParts.push(`[${prevA}]anull[aout]`);
  }

  const filterComplex = filterParts.join(";");

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg();
    for (const p of inputPaths) cmd = cmd.input(p);

    cmd
      .complexFilter(filterComplex)
      .outputOptions([
        "-map [vout]",
        "-map [aout]",
        "-c:v h264_videotoolbox",
        "-b:v 4M",
        "-c:a aac",
        "-b:a 128k",
        "-movflags +faststart",
        "-r", String(fps),
      ])
      .output(outputPath)
      .on("start", (s) => console.log("[ffmpeg] start:", s.slice(0, 120)))
      .on("progress", (p) => process.stdout.write(`\r[ffmpeg] ${p.percent?.toFixed(1) ?? "?"}%`))
      .on("end", () => { process.stdout.write("\n"); resolve(); })
      .on("error", (err) => { process.stdout.write("\n"); reject(err); })
      .run();
  });
}
